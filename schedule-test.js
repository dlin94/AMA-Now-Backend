import Schedule from 'node-schedule';

for (let i = 0; i <= 59; i++) {
  const date = new Date(2017, 1, 26, 15, 0, i);
  Schedule.scheduleJob(date, () => {
    console.log("Second: " + i);
  });
}
