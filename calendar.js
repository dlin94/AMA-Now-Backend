import request from 'request';
import Event from './models/event-model';

const CALENDAR_ID = process.env.CALENDAR_ID || 'amaverify@gmail.com'
const API_KEY = process.env.API_KEY || 'AIzaSyA2yG721085RrJDXnQwTAu6j0dcMU6EvTQ';

// https://calendar.google.com/calendar/embed?src=amaverify@gmail.com
// https://developers.google.com/google-apps/calendar/v3/reference/events/list

// TODO: Should be scheduled for once a day; may need to store in DB, and events should be removed accordingly on update
// DB should be updated once a day. Just drop the DB and repopulate it with data
// from calendar API call.
// Might need to deal with timezone offsets... Read events reference and this: http://stackoverflow.com/questions/10830357/javascript-toisostring-ignores-timezone-offset
export const getEvents = () => { // TODO: temporary parameter...probably not needed
  const timeMin = (new Date()).toISOString();
  request(`https://www.googleapis.com/calendar/v3/calendars/${CALENDAR_ID}/events?key=${API_KEY}&timeMin=${timeMin}`, {
    method: 'GET'
  }, (err, response, body) => {
    if (err) {
      console.log("Error: " + err);
    } else {
      //console.log(body);
      const events = JSON.parse(body).items;
      //console.log(events);
      //console.log(events);
      //console.log(events.length);
      //console.log(response.statusCode);
      // TODO: Modify so that we're only adding what needs to be added. Also must remove documents, probably in a separate method.
      for (let e of events) {
        const subjects = getSubjects(e.summary);
        Event.find({'people': subjects}).exec((err, ev) => {
          if (err) {
            console.log(err);
          }
          else {
            if (ev.length == 0) {
              console.log(`Adding ${subjects} to DB!`);
              const event = new Event();
              event.date = e.start.dateTime;
              event.people = subjects;
              event.save() // TODO: only save if not already in database
              .then(result => {
                //console.log("Result: " + result);
              })
              .catch(err => {
                //console.log("Error: d" + err);
              });
            }
          }
        });
      }
      Event.collection.drop(); // TODO: Make sure this ONLY drops the collection and not the database
    }
  });
}

export const getSchedule = (req, res) => {
  Event.find().select('people date -_id').exec((err, ev) => {
    if (err) {
      console.log(err);
      res.send(err);
    } else {
      res.json(ev);
    }
  })
}

const getSubjects = (summary) => {
  let subjects = null;
  //let summArray = null;
  if (summary.startsWith("[")) { // remove brackets
    const n = summary.indexOf("]")
    summary = summary.slice(1,n);
  }

  if (summary.includes(",")) {
    subjects = summary.split(", ");
    const last = subjects.length-1;
    if (subjects[last].includes("and ")) {
      subjects[last] = subjects[last].replace("and ", "");
    } else if (subjects[last].includes("& ")){
      subjects[last] = subjects[last].replace("& ", "");
    }
  } else if (summary.includes("and")) {
    subjects = summary.split(" and ");
  } else {
    subjects = summary.split(" & ");
  }
  return subjects;
}

//const convertToUTC = (dateString) => {
//  return dateString.slice(0, -6) + 'Z';
//}
