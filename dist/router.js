'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _express = require('express');

var _redditAccess = require('./reddit-access');

var _calendar = require('./calendar');

var router = (0, _express.Router)();
router.route('/comment').post(_redditAccess.retrieveToken);

router.route('/schedule').get(_calendar.getSchedule);

exports.default = router;