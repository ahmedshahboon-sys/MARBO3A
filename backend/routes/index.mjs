import {registerAuthRegistration} from "./auth-registration.mjs";
import {registerAuthSession} from "./auth-session.mjs";
import {registerCoreRooms} from "./core-rooms.mjs";
import {registerCoreMessaging} from "./core-messaging.mjs";
import {registerCoreSocial} from "./core-social.mjs";
import {registerCoreLocation} from "./core-location.mjs";
import {registerCoreAdminRooms} from "./core-admin-rooms.mjs";
import {registerCorePresence} from "./core-presence.mjs";

export function registerExplicitRoutes(app){
  registerAuthRegistration(app);
  registerAuthSession(app);
  registerCoreRooms(app);
  registerCoreMessaging(app);
  registerCoreSocial(app);
  registerCoreLocation(app);
  registerCoreAdminRooms(app);
  registerCorePresence(app);
}
