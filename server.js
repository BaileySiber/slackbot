const { RTMClient, WebClient } = require('@slack/client');
const { createMessageAdapter } = require('@slack/interactive-messages');
const slackInteractions = createMessageAdapter(process.env.SLACKBOT_USER_TOKEN)
const express = require('express');
const { User, Reminder, Meeting, Invite } = require('./models.js')
const googleAuth = require("./googleAuth");
const bodyParser = require('body-parser');
// const JSON = require('circular-json');


const app = express();
app.use(bodyParser.urlencoded({extended: false}))
// create app/json parser
app.use(bodyParser.json())
// module with logic for dealing with HTTP requests
// const http = require('http');
// define port used for ngrok
const PORT=7707;

// app.use('/actions', slackInteractions.expressMiddleware());
// Get an API token by creating an app at <https://api.slack.com/apps?new_app=1>
// It's always a good idea to keep sensitive data like the token outside your source code. Prefer environment variables.
const token = process.env.SLACKBOT_USER_TOKEN || '';
if (!token) { console.log('You must specify a token to use this example'); process.exitCode = 1; throw 1; }

// Initialize an RTM API client
const rtm = new RTMClient(token);
const web = new WebClient(token);
// Start the connection to the platform
rtm.start();

// You can find your project ID in your Dialogflow agent settings
const projectId = process.env.DIALOGFLOW_PROJECT_ID;
const sessionId = 'quickstart-session-id';
const languageCode = 'en-US';

// Instantiate a DialogFlow client.
const dialogflow = require('dialogflow');
const sessionClient = new dialogflow.SessionsClient();

// Define session path
const sessionPath = sessionClient.sessionPath(projectId, sessionId);

// The text query request.

// button actions route

// Log all incoming messages
rtm.on('message', (event) => {
  console.log(event)
  if (event.bot_id || event.subtype || event.user === 'UBWEG21RD') {
    return
  }

  var slackId = event.user;
  User.findOne({slackId: slackId})
  .then(user => {
    if(!user && !event.bot_id) {
      console.log('new user!!!')
      var newUser = new User({slackId: slackId})
      newUser.save()
      .then(saved => {
        web.chat.postMessage({
          "channel": event.channel,
          "text": "You are a new user, please log in to Google:" + process.env.DOMAIN + "/auth?auth_id=" + saved._id
        })
      })
    }
    else if(!user.googleTokens || user.googleTokens.expiry_date < Date.now()) {
      console.log('tokens do not exist or have expired!!!')
      web.chat.postMessage({
        "channel": event.channel,
        "text": "Google token is expired, try again:" + process.env.DOMAIN + "/auth?auth_id=" + user._id
      })
    }
    else {
      const request = {
        session: sessionPath,
        queryInput: {
          text: {
            text: event.text,
            languageCode: languageCode,
          },
        },
      };

      // Send request and log result
      sessionClient
      .detectIntent(request)
      .then(responses => {
        //rtm.sendMessage('Detected intent', event.channel);
        const result = responses[0].queryResult;
        if (result.intent.displayName === "remind:add") {
          User.findOne({slackId: slackId})
          .then(found => {
            if(!found) {return console.log('user not found')}
            found.temp = {
              date: result.parameters.fields.date.stringValue.slice(0,10),
              // time: result.parameters.fields.time.stringValue.slice(11,18),
              task: result.parameters.fields.task.stringValue,
              intent: 'remind:add'
            }
            return found.save()
          })
          .then(() => {
            console.log('yay found user was updated with temp!!!!!')
            //remind
          })
          .catch(err => console.log("error!!!!" + err))
        }

        if (result.intent.displayName === "meeting:add") {
          var stringifiedResult = JSON.stringify(result);
          User.findOne({slackId: slackId})
          .then(found => {
            var mapInvitee = []
            result.parameters.fields.invitees.listValue.values.map(id => {
              if (id.stringValue[0] === "<") {
                mapInvitee.push(id.stringValue.slice(2,11))
              }
            })

            // check for time conflicts
            let startDate = result.parameters.fields.startDate.stringValue.slice(0,10);
            let startTime = result.parameters.fields.startTime.stringValue.slice(11,19);
            let startDateTime = startDate + 'T' + startTime + "-07:00";


            console.log("date/times --------------------------------------" + startDate + " DATE " + startTime + " TIME " + startDateTime)


            let endTime = startTime.split(":")
            endTime[1] = 30;
            let finalEndTime = endTime.join(":")
            let endDateTime = startDate + 'T' + finalEndTime + "-07:00"

            console.log("end daaaate yaaaaay ---------------" + endDateTime)


            found.temp = {
              startDateTime: startDateTime,
              endDateTime: endDateTime,
              attendees: mapInvitee,
              intent: 'meeting:add'
            }
            return found.save()
          })
          .then(() => {
            console.log("yay found was updated with temp!!! wooooo!!!")
            //meeting
          })
          .catch(err => console.log("error!!!!" + err))
        }

        rtm.sendMessage(`${result.fulfillmentText}`, event.channel);

        //remind and meeting



        //rtm.sendMessage(`  Query: ${result.queryText}`, event.channel);

        if (result.intent.displayName === "remind:add" && result.allRequiredParamsPresent === true) { //if result.allRequiredParamsPresent === true
          //result.fulfillmentText.includes("set")

          web.chat.postMessage({
            "channel": event.channel,
            "text": "Please confirm.",
            "attachments": [
              {
                // "text": `Remind you $subject on $day`,
                "fallback": "I didn't get your reminder request. Try again.",
                "callback_id": "reminderSetting",
                "color": "#3AA3E3",
                "attachment_type": "default",
                "type": "interactive-message",
                "actions": [
                  {
                    "name": "confirm",
                    "text": "Confirm",
                    "type": "button",
                    "value": "confirm",
                    "style": "primary"
                  },
                  {
                    "name": "cancel",
                    "text": "Cancel",
                    "style": "danger",
                    "type": "button",
                    "value": "cancel",
                    "confirm": {
                      "title": "Are you sure?",
                      "ok_text": "Yes",
                      "dismiss_text": "No"
                    }
                  }
                ]
              }
            ]
          })
        }

        if (result.intent.displayName === "meeting:add" && result.allRequiredParamsPresent === true){
          web.chat.postMessage({
            "channel": event.channel,
            "text": "Please confirm.",
            "attachments": [
              {
                // "text": `Remind you $subject on $day`,
                "fallback": "I didn't get your meeting request. Try again.",
                "callback_id": "meetingSetting",
                "color": "#3AA3E3",
                "attachment_type": "default",
                "type": "interactive-message",
                "actions": [
                  {
                    "name": "confirm",
                    "text": "Confirm",
                    "type": "button",
                    "value": "confirm",
                    "style": "primary"
                  },
                  {
                    "name": "cancel",
                    "text": "Cancel",
                    "style": "danger",
                    "type": "button",
                    "value": "cancel",
                    "confirm": {
                      "title": "Are you sure?",
                      "ok_text": "Yes",
                      "dismiss_text": "No"
                    }
                  }
                ]
              }
            ]
          })
        }
        else {
          console.log('No intent matched')
        }

      })
    }
    //here
  })
  .catch(err => {
    console.error('ERROR:', err);
  });


})

// Log all reactions
rtm.on('reaction_added', (event) => {
  // Structure of `event`: <https://api.slack.com/events/reaction_added>
  console.log(`Reaction from ${event.user}: ${event.reaction}`);
});
rtm.on('reaction_removed', (event) => {
  // Structure of `event`: <https://api.slack.com/events/reaction_removed>
  console.log(`Reaction removed by ${event.user}: ${event.reaction}`);
});

// Send a message once the connection is ready
rtm.on('ready', (event) => {
  // Getting a conversation ID is left as an exercise for the reader. It's usually available as the `channel` property
  // on incoming messages, or in responses to Web API requests.

  // const conversationId = '';
  // rtm.sendMessage('Hello, world!', conversationId);
});




//Google stuff
//gives permission to access Google Calendar
app.get('/auth', (req, res) => {
  if(!req.query.auth_id) {return res.send('no id found!')}
  var link = googleAuth.generateAuthUrl(req.query.auth_id)
  res.redirect(link)
})


//state = slackId


//if user is logged in with Google...
app.get('/oauthcallback', (req, res) => {
  if(!req.query.code) {return res.send('no token found!')}
  googleAuth.getToken(req.query.code)
  .then(tokens => {
    var temp = JSON.parse(decodeURIComponent(req.query.state))
    var userId = temp.auth_id
    return User.findByIdAndUpdate(userId, {googleTokens: tokens})
  })
  .then(updated => {
    if(!updated) {return res.send('issue with finding user i think')}
    res.send('you are all set with Google!!!')
  })
  .catch(err => console.log("error", error))
})


//when user clicks "Confirm" or "Cancel" to interactive message
app.get('slack/action', (req, res) => {
  res.status(200).send('success');
})

app.post('/slack/action', (req, res) => {
  var payload = JSON.parse(req.body.payload);
  var slackId = String(payload.user.id)
  var selection = payload.actions[0].value;
  var user;

  if(selection !== "confirm"){
    User.findOneAndUpdate({slackId: slackId}, {status: null})
    .then(() => res.send('Request has been cancelled!'))
    .catch(err => console.log("error cancelling request", err))
    return;
  }

  User.findOne({slackId: slackId}, (err, found) => {
    if(err) {return res.send('error finding user', err)}
    if(!found) {return res.send('user not found merp')}
    user = found;


    if (user.temp.intent === "remind:add") {
      let title = user.temp.task;
      let date = user.temp.date;
      let tokens = user.googleTokens;
      googleAuth.createReminder(tokens, title, date)
      .then( () => {
        user.status = null;
        user.temp.intent = null;
        console.log('reminder successfully created!!!')
        return user.save()
      })
      .then((user) => {
        res.end()
      })
      .catch(err => console.log('error making reminder event and updating user', err))
    }

    if (user.temp.intent === "meeting:add") {
      // startDateTime defined in line 135 and added to temp in line 149
      // var endDateTime = ( endTime ? new Date( date + 'T' + endTime ) : new Date( startDateTime.getTime() + 1000*60*foundUser.defaultMeetingLength ) );
      let startDateTime = user.temp.startDateTime;
      let endDateTime = user.temp.endDateTime
      let attendees = user.temp.attendees;

      let promisesOne = attendees.map(invitee => {
        return User.findOne({slackId: invitee})
      })

      Promise.all(promisesOne)
      .then(function(users){
        let usersArr = users;
        usersArr.push(found)
        let conflictPromises =  usersArr.map(user => {
          console.log('user slack id is ______________________' + user.slackId)
          return  googleAuth.checkConflict(user.googleTokens, user.slackId, startDateTime, endDateTime)
        })
        return Promise.all(conflictPromises)
      })
      .then((conflicts) => {
        console.log(conflicts[0].data)
        for(var i = 0; i < conflicts.length; i++){
          if(conflicts[i].data.calendars.primary.busy.length > 0){
            return res.send("Uh oh! There is a conflict, try again!")
          }
        }
        let promisesTwo = attendees.map(attendee => {
          return User.findOne({slackId: attendee})
        })
        Promise.all(promisesTwo)
        .then(function(users){
          let userTokensArr = users.map(user => {
            return user.googleTokens
          })
          userTokensArr.push(user.googleTokens)
          let schedulePromises =  userTokensArr.map(tokens => {
            return  googleAuth.createMeeting(tokens, startDateTime)
          })
          return Promise.all(schedulePromises)
        })
        .then(() => res.send("yay we made a meeting!!!!!!!!!"))
      })
      .catch(err => console.log("error in conflicts/meeting" + err))
    }
  })
})




// request handler function, sends a simple response
function handleRequest(req, res) {
  res.end('Ngrok is working! - Path Hit: '+ req.url);
}

// create web server object calling createServer function
// const server = http.createServer(app);
// start the server
app.listen(PORT, function(){
  // callback when server is successfully listening
  console.log("Server listening on http://localhost:%s", PORT);
});
