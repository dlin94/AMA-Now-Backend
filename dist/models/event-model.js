'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _mongoose = require('mongoose');

var _mongoose2 = _interopRequireDefault(_mongoose);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var EventSchema = new _mongoose.Schema({
  people: [String],
  date: String
});

_mongoose2.default.Promise = require('bluebird');
var EventModel = _mongoose2.default.model('Event', EventSchema);

exports.default = EventModel;