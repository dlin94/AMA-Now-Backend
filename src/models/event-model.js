import mongoose, { Schema } from 'mongoose';

const EventSchema = new Schema({
  people: [String],
  date: String,
});

mongoose.Promise = require('bluebird');
const EventModel = mongoose.model('Event', EventSchema);

export default EventModel;
