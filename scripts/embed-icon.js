/**
 * Deprecated: do not rcedit portable or NSIS installers after build.
 * That breaks NSIS integrity checks ("Installer integrity check has failed").
 * App icon is embedded in Projects.exe via after-pack.js during electron-builder.
 */
console.log("embed-icon: skipped (icon is set in after-pack.js; post-build rcedit breaks portable exe)");
