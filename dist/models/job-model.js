'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _mongoose = require('mongoose');

var _mongoose2 = _interopRequireDefault(_mongoose);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var JobSchema = new _mongoose.Schema({
  date: Date,
  refresh: String,
  ama: String,
  question: String
});

_mongoose2.default.Promise = require('bluebird');
var JobModel = _mongoose2.default.model('Job', JobSchema);

exports.default = JobModel;