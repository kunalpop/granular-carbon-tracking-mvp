/**
 * Clear frontend registration caches for local testing.
 *
 * Run this in the browser DevTools Console while the app is open.
 * It clears browser UI state only; blockchain registrations are unchanged.
 */

localStorage.removeItem("registered-actors-cache");
localStorage.removeItem("registered-product-cache");

localStorage.clear();

console.log("Frontend registration caches cleared.");
console.log("Reloading the application...");
window.location.reload();
