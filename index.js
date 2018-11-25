'use strict';

const functions = require('firebase-functions');
const { WebhookClient } = require('dialogflow-fulfillment');
//const { Card, Suggestion } = require('dialogflow-fulfillment');

const admin = require('firebase-admin');
admin.initializeApp();


//process.env.DEBUG = 'dialogflow:debug';

exports.dialogflowFirebaseFulfillment = functions.https.onRequest((request, response) => {

    console.log('Dialogflow Request headers: ' + JSON.stringify(request.headers));
    console.log('Dialogflow Request body: ' + JSON.stringify(request.body));

    const agent = new WebhookClient({ request, response });

    function welcome(agent) {
        agent.add(`Welcome to my agent!`);
        agent.add(`let me welcome you again`);
    }

    function fallback(agent) {
        agent.add(`I didn't understand`);
        agent.add(`I'm sorry, can you try again?`);
    }

    function addtodb(hall, datestring, date, start, end) {
        return new Promise((resolve, reject) => {
            admin.database().ref('/halls/' + hall + '/bookings/' + datestring).push({
                date: date,
                start_time: start,
                end_time: end
            }).then((snapshot) => {
                resolve(snapshot);
            }).catch((err) => {
                reject(err);
            });
        });
    }


    function getEmpId(empid) {
        return new Promise((resolve, reject) => {
            admin.database().ref('/employee').child(empid).once('value', (snapshot) => {
                if (snapshot.exists()) {
                    resolve(snapshot);
                } else {
                    reject(snapshot);
                }
            })
        });
    }

    function getHallName(hallname) {
        return new Promise((resolve, reject) => {
            admin.database().ref('/halls').child(hallname).once('value', (snapshot) => {
                if (snapshot.exists()) {
                    resolve(snapshot);
                } else {
                    reject(snapshot);
                }
            })
        });
    }

    function checkHallData(hall, datestring) {
        return new Promise((resolve, reject) => {
            admin.database().ref('/halls/' + hall + '/bookings/' + datestring).once('value').then((snapshot) => {
                resolve(snapshot);
            }).catch((err) => {
                reject(err);
            })
        });
    }

    function UserProvidesEmpID(agent) {
        var empid = agent.parameters.empid;
        return getEmpId(empid).then((data) => {
            agent.setContext({
                'name': 'awaiting_password',
                'lifespan': 2,
                'parameters': {
                    'empid': empid
                }
            });
            agent.add('Please enter your password.');
        }).catch((err) => {
            console.log(err);
            agent.add('Sorry.. employee id not found. Please reenter Employee id.');
        });
    }

    function UserProvidesPassword(agent) {
        var password = agent.parameters.password;
        var empid = agent.getContext('awaiting_password').parameters.empid;

        return getEmpId(empid).then((data) => {
            var pass = data.val().password;
            var name = data.val().name;
            if (pass === password) {
                agent.setContext({
                    'name': 'awaiting_avhallname',
                    'lifespan': 2,
                    'parameters': {
                        'empid': empid
                    }
                });
                agent.add('Welcome ' + name + '. Please enter an AV Hall name.');
            } else {
                agent.add('Sorry.. Employee id and password doesnt match. please reenter password.');
            }
        }).catch((err) => {
            console.log(err);
            agent.add('Sorry.. an unknown error occured');
        });
    }

    function UserProvidesHallName(agent) {
        var hall = agent.parameters.av_room;
        var empid = agent.getContext('awaiting_avhallname').parameters.empid;
        return getHallName(hall).then((data) => {
            agent.setContext({
                'name': 'awaiting_book_date',
                'lifespan': 2,
                'parameters': {
                    'hallname': hall,
                    'empid': empid
                }
            });
            agent.add('Please enter a booking date.');
        }).catch((err) => {
            console.log(err);
            agent.add('Sorry.. enter a valid hall name');
        })
    }

    function UserProvidesBookDate(agent) {
        var date = agent.parameters.date;
        var empid = agent.getContext('awaiting_book_date').parameters.empid;
        var hallname = agent.getContext('awaiting_book_date').parameters.hallname;

        var entereddate = new Date(date);
        var todaysdate = new Date();

        if (entereddate < todaysdate) {
            agent.add('Invalid Date. please enter a valid date');
        } else {
            agent.setContext({
                'name': 'awaiting_book_time',
                'lifespan': 2,
                'parameters': {
                    'hallname': hallname,
                    'empid': empid,
                    'date': date
                }
            });
            agent.add('Please enter the time range.');
        }
    }

    function UserProvidesTimeRange(agent) {
        var timerange = agent.parameters.timerange;
        var date = agent.getContext('awaiting_book_time').parameters.date;
        var empid = agent.getContext('awaiting_book_time').parameters.empid;
        var hallname = agent.getContext('awaiting_book_time').parameters.hallname;

        console.log(timerange);
        var startTime = new Date(timerange.startTime);
        var endTime = new Date(timerange.endTime);

        if (startTime > endTime) {
            agent.add('Invalid time range. please reenter timerange');
        } else {
            //create datestring
            var dateStamp = new Date(date);
            var datestring = dateStamp.getFullYear() + '' + dateStamp.getMonth() + '' + dateStamp.getDate();

            //get date snapshot
            return checkHallData(hallname, datestring).then((snapshot) => {
                if (snapshot.numChildren() === 0) {
                    //no bookings on that date. insert new booking
                    return addtodb(hallname, datestring, date, timerange.startTime, timerange.endTime, agent).then((snapshot) => {
                        return agent.add('Booked');
                    });
                } else {
                    //bookings are there. loop for time overlap
                    let flag = 0;
                    console.log('reached');
                    snapshot.forEach((value) => {
                        var startOldTime = new Date(value.val().start_time).getTime();
                        var endOldTime = new Date(value.val().end_time).getTime();

                        if ((startOldTime <= endTime.getTime()) && (endOldTime >= startTime.getTime())) {
                            flag = 1;
                        } else {

                        }
                    });
                    if (flag === 0) {
                        console.log('booking');
                        return addtodb(hallname, datestring, date, timerange.startTime, timerange.endTime, agent).then((snapshot) => {
                            return agent.add('Booked');
                        });
                    } else {
                        console.log('slot filled');
                        return agent.add('Sorry.. AV Hall not available between the provided time range.');
                    }
                }
            }).catch((err) => {
                console.log(err);
                return agent.add('Sorry.. An unknown error occured');
            })

        }
    }


    let intentMap = new Map();
    intentMap.set('Default Welcome Intent', welcome);
    intentMap.set('Default Fallback Intent', fallback);

    intentMap.set('UserProvidesEmpID', UserProvidesEmpID);
    intentMap.set('UserProvidesPassword', UserProvidesPassword);
    intentMap.set('UserProvidesHallName', UserProvidesHallName);
    intentMap.set('UserProvidesBookDate', UserProvidesBookDate);
    intentMap.set('UserProvidesTimeRange', UserProvidesTimeRange);



    agent.handleRequest(intentMap);
});
