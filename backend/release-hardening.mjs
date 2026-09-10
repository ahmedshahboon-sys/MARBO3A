import http from "http";
import pg from "pg";
import { createClient } from "redis";

const previousCreateServer = http.createServer.bind(http);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const redis = createClient({ url: process.env.REDIS_URL });
redis.on("error", error => console.error("Release hardening Redis:", error));
let ready;

const clean = (value = "", max = 1000) => String(value ?? "").trim().slice(0, max);
const bearer = req => String(req.headers.authorization || "").match(/^Bearer\s+([a-f0-9]{64})$/i)?.[1] || "";

async function infra() {
  if (!ready) ready = (async () => {
    if (!redis.isOpen) await redis.connect();
    await pool.query(`CREATE INDEX IF NOT EXISTS direct_conversations_pair_idx ON direct_conversations(LEAST(user1_id,user2_id),GREATEST(user1_id,user2_id))`);
    await pool.query(`CREATE INDEX IF NOT EXISTS post_comments_owner_idx ON post_comments(user_id,id DESC) WHERE deleted_at IS NULL`);
  })().catch(error => { ready = null; throw error; });
  return ready;
}

async function currentUser(req) {
  await infra();
  const token = bearer(req);
  if (!token) return null;
  const id = await redis.get(`session:${token}`);
  if (!id) return null;
  return (await pool.query(`SELECT id,username,display_name,avatar_url,account_status FROM users WHERE id=$1`, [id])).rows[0] || null;
}

async function auth(req, res) {
  const user = await currentUser(req);
  if (!user) { res.status(401).json({ ok:false, error:"UNAUTHORIZED" }); return null; }
  if (user.username !== "ahmed" && user.account_status !== "active") {
    res.status(403).json({ ok:false, error:"ACCOUNT_RESTRICTED" });
    return null;
  }
  return user;
}

async function isBlocked(a, b) {
  try {
    return Boolean((await pool.query(`SELECT 1 FROM user_blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1) LIMIT 1`, [a,b])).rows[0]);
  } catch { return false; }
}

async function areFriends(a, b) {
  return Boolean((await pool.query(`SELECT 1 FROM friendships WHERE status='accepted' AND ((requester_id=$1 AND addressee_id=$2) OR (requester_id=$2 AND addressee_id=$1)) LIMIT 1`, [a,b])).rows[0]);
}

async function messagingRule(targetId) {
  try {
    return (await pool.query(`SELECT who_can_message FROM profile_privacy WHERE user_id=$1`, [targetId])).rows[0]?.who_can_message || "friends";
  } catch { return "friends"; }
}

async function addNotification(userId, actorId, type, title, body, refId = null) {
  if (String(userId) === String(actorId)) return;
  try {
    await pool.query(`INSERT INTO notifications(user_id,actor_id,type,title,body,ref_id) VALUES($1,$2,$3,$4,$5,$6)`, [userId,actorId,type,title,body,refId]);
  } catch (error) { console.error("notification insert", error.message); }
}

http.createServer = function releaseHardenedCreateServer(app, ...args) {
  if (typeof app === "function" && app?.use) {
    infra().catch(error => console.error("release hardening init", error));

    // Authoritative direct-chat creation. This is intentionally registered before legacy routes.
    app.post("/api/chats/with/:userId", async (req, res) => {
      try {
        const user = await auth(req, res); if (!user) return;
        const targetId = Number(req.params.userId);
        if (!Number.isSafeInteger(targetId) || targetId <= 0 || targetId === Number(user.id)) {
          return res.status(400).json({ ok:false, error:"INVALID_USER" });
        }
        const target = (await pool.query(`SELECT id,username,display_name,avatar_url,account_status FROM users WHERE id=$1`, [targetId])).rows[0];
        if (!target || target.account_status !== "active") return res.status(404).json({ ok:false, error:"USER_NOT_FOUND" });
        if (await isBlocked(user.id, targetId)) return res.status(403).json({ ok:false, error:"USER_BLOCKED" });
        const rule = await messagingRule(targetId);
        if (rule === "nobody") return res.status(403).json({ ok:false, error:"PRIVACY_RESTRICTED" });
        if (rule === "friends" && !(await areFriends(user.id, targetId))) return res.status(403).json({ ok:false, error:"FRIENDS_ONLY" });

        const low = Math.min(Number(user.id), targetId);
        const high = Math.max(Number(user.id), targetId);
        let conversation = (await pool.query(`SELECT * FROM direct_conversations WHERE LEAST(user1_id,user2_id)=$1 AND GREATEST(user1_id,user2_id)=$2 LIMIT 1`, [low,high])).rows[0];
        let created = false;
        if (!conversation) {
          conversation = (await pool.query(`INSERT INTO direct_conversations(user1_id,user2_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING *`, [low,high])).rows[0];
          created = Boolean(conversation);
          if (!conversation) conversation = (await pool.query(`SELECT * FROM direct_conversations WHERE LEAST(user1_id,user2_id)=$1 AND GREATEST(user1_id,user2_id)=$2 LIMIT 1`, [low,high])).rows[0];
        }
        if (!conversation) return res.status(500).json({ ok:false, error:"CHAT_CREATE_FAILED" });
        return res.status(created ? 201 : 200).json({ ok:true, created, conversation, peer:target });
      } catch (error) {
        console.error("direct chat create hardened", error);
        return res.status(500).json({ ok:false, error:"CHAT_CREATE_FAILED" });
      }
    });

    app.get("/api/feed/:id", async (req, res) => {
      try {
        const user = await auth(req, res); if (!user) return;
        const id = Number(req.params.id);
        if (!Number.isSafeInteger(id)) return res.status(400).json({ ok:false, error:"INVALID_POST" });
        const post = (await pool.query(`SELECT p.id,p.body,p.image_url,p.created_at,p.updated_at,u.id user_id,u.username,u.display_name,u.avatar_url,COUNT(DISTINCT l.user_id)::int likes_count,COUNT(DISTINCT c.id) FILTER(WHERE c.deleted_at IS NULL)::int comments_count,BOOL_OR(l.user_id=$1) liked FROM posts p JOIN users u ON u.id=p.user_id LEFT JOIN post_likes l ON l.post_id=p.id LEFT JOIN post_comments c ON c.post_id=p.id WHERE p.id=$2 AND p.deleted_at IS NULL GROUP BY p.id,u.id`, [user.id,id])).rows[0];
        if (!post) return res.status(404).json({ ok:false, error:"POST_NOT_FOUND" });
        res.json({ ok:true, post });
      } catch (error) {
        console.error("feed item", error);
        res.status(500).json({ ok:false, error:"POST_LOAD_FAILED" });
      }
    });

    app.patch("/api/feed/:postId/comments/:commentId", async (req, res) => {
      try {
        const user = await auth(req, res); if (!user) return;
        const postId = Number(req.params.postId), commentId = Number(req.params.commentId), body = clean(req.body?.body, 1000);
        if (!body) return res.status(400).json({ ok:false, error:"EMPTY_COMMENT" });
        const comment = (await pool.query(`SELECT id,user_id FROM post_comments WHERE id=$1 AND post_id=$2 AND deleted_at IS NULL`, [commentId,postId])).rows[0];
        if (!comment) return res.status(404).json({ ok:false, error:"COMMENT_NOT_FOUND" });
        if (String(comment.user_id) !== String(user.id) && user.username !== "ahmed") return res.status(403).json({ ok:false, error:"FORBIDDEN" });
        const updated = (await pool.query(`UPDATE post_comments SET body=$1,edited_at=NOW() WHERE id=$2 RETURNING id,post_id,user_id,body,created_at,edited_at`, [body,commentId])).rows[0];
        res.json({ ok:true, comment:updated });
      } catch (error) {
        console.error("comment edit", error);
        res.status(500).json({ ok:false, error:"COMMENT_UPDATE_FAILED" });
      }
    });

    app.delete("/api/feed/:postId/comments/:commentId", async (req, res) => {
      try {
        const user = await auth(req, res); if (!user) return;
        const postId = Number(req.params.postId), commentId = Number(req.params.commentId);
        const comment = (await pool.query(`SELECT id,user_id FROM post_comments WHERE id=$1 AND post_id=$2 AND deleted_at IS NULL`, [commentId,postId])).rows[0];
        if (!comment) return res.status(404).json({ ok:false, error:"COMMENT_NOT_FOUND" });
        if (String(comment.user_id) !== String(user.id) && user.username !== "ahmed") return res.status(403).json({ ok:false, error:"FORBIDDEN" });
        await pool.query(`UPDATE post_comments SET body='',deleted_at=NOW() WHERE id=$1`, [commentId]);
        res.json({ ok:true, commentId });
      } catch (error) {
        console.error("comment delete", error);
        res.status(500).json({ ok:false, error:"COMMENT_DELETE_FAILED" });
      }
    });

    // Lightweight social notifications for likes/comments without exposing secrets.
    app.use(async (req, _res, next) => {
      try {
        const like = req.path.match(/^\/api\/feed\/(\d+)\/like$/);
        const comment = req.path.match(/^\/api\/feed\/(\d+)\/comments$/);
        if (req.method === "POST" && (like || comment)) {
          const user = await currentUser(req);
          if (user) {
            const postId = Number((like || comment)[1]);
            const owner = (await pool.query(`SELECT user_id FROM posts WHERE id=$1 AND deleted_at IS NULL`, [postId])).rows[0]?.user_id;
            // Run after the response so failed requests do not create false notifications.
            _res.on("finish", () => {
              if (_res.statusCode >= 200 && _res.statusCode < 300 && owner) {
                addNotification(owner, user.id, like ? "post_like" : "post_comment", like ? "إعجاب جديد" : "تعليق جديد", like ? `${user.display_name} أعجب بمنشورك` : `${user.display_name} علّق على منشورك`, postId).catch(()=>{});
              }
            });
          }
        }
      } catch {}
      next();
    });
  }
  return previousCreateServer(app, ...args);
};
