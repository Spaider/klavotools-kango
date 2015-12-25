/**
 * A helper for creating the testing environment context.
 *
 * @author Daniil Filippov aka agile <filippovdaniil@gmail.com>
 */

var kango = require('./kango-mock.js');

module.exports = {
  kango: kango,
  isNull: function (obj) {},
  xhr: function (detail) {},
  // Creating references to some default global functions and objects:
  setTimeout: setTimeout,
  setInteval: setInterval,
  clearTimeout: clearTimeout,
  clearInterval: clearInterval,
  console: console,
}
