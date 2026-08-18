/* BastCompta - garde d'acces commune aux modules integres au portail. */
(function (global) {
  'use strict';

  const ACCESS_KEY = 'bastcompta_portal_access';

  function hasPortalAccess() {
    try {
      return global.top !== global.self && global.sessionStorage.getItem(ACCESS_KEY) === 'granted';
    } catch (error) {
      return false;
    }
  }

  function requirePortalAccess(portalUrl = 'index.html') {
    if (hasPortalAccess()) return true;
    global.location.replace(portalUrl);
    return false;
  }

  global.BastComptaAccess = Object.freeze({ ACCESS_KEY, hasPortalAccess, requirePortalAccess });
})(window);
