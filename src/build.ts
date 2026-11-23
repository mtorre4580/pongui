// Which build this is. Constants known at build time, so the other builds drop the code.
import { IS_NATIVE } from './native';

/**
 * `vite build --mode portal`: only the game, packed to be uploaded to a games portal (itch.io),
 * where it runs inside the portal's own page.
 */
export const IS_PORTAL = import.meta.env.MODE === 'portal';

/**
 * The game is not being played on the public site (an app, or a portal's page): links meant for
 * other people must point to the site, and the page is not this project's to install or measure.
 */
export const OFF_SITE = IS_NATIVE || IS_PORTAL;
