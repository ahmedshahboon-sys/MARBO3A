import {registerAuthRegistration} from "./auth-registration.mjs";
import {registerAuthSession} from "./auth-session.mjs";
import {registerCoreRooms} from "./core-rooms.mjs";
import {registerCoreMessaging} from "./core-messaging.mjs";
import {registerCoreSocial} from "./core-social.mjs";
import {registerCoreLocation} from "./core-location.mjs";
import {registerCoreAdminRooms} from "./core-admin-rooms.mjs";
import {registerCoreAdminControl} from "./core-admin-control.mjs";
import {registerCorePresence} from "./core-presence.mjs";
import {registerFghSocial} from "./fgh-social.mjs";
import {registerGroupMNEngagement} from "./group-mn-engagement.mjs";
import {registerGroupOAdmin} from "./group-o-admin.mjs";

export function registerExplicitRoutes(app){
  registerAuthRegistration(app);
  registerAuthSession(app);
  registerFghSocial(app);
  registerCoreRooms(app);
  registerCoreMessaging(app);
  registerCoreSocial(app);
  registerCoreLocation(app);
  registerCoreAdminRooms(app);
  registerCoreAdminControl(app);
  registerCorePresence(app);
  registerGroupMNEngagement(app);
  registerGroupOAdmin(app);
}
