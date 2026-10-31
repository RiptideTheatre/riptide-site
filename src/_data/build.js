// A fresh value on every build, added to CSS and script links so phones fetch the new files after each deploy.
module.exports = { v: Date.now().toString(36) };
