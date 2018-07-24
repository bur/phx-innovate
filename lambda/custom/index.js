/**

    Copyright 2017-2018 Amazon.com, Inc. and its affiliates. All Rights Reserved.
    Licensed under the Amazon Software License (the "License").
    You may not use this file except in compliance with the License.
    A copy of the License is located at
      http://aws.amazon.com/asl/
    or in the "license" file accompanying this file. This file is distributed
    on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, express
    or implied. See the License for the specific language governing
    permissions and limitations under the License.

    This skill demonstrates how to use Dialog Management to delegate slot
    elicitation to Alexa. For more information on Dialog Directives see the
    documentation: https://developer.amazon.com/docs/custom-skills/dialog-interface-reference.html

    This skill also uses entity resolution to define synonyms. Combined with
    dialog management, the skill can ask the user for clarification of a synonym
    is mapped to two slot values.
 **/

/* eslint-disable  func-names */
/* eslint-disable  no-restricted-syntax */
/* eslint-disable  no-loop-func */
/* eslint-disable  consistent-return */
/* eslint-disable  no-console */

const Alexa = require('ask-sdk-core');
// Load the AWS SDK for Node.js
const AWS = require('aws-sdk');


// Set the region
AWS.config.update({ region: 'us-west-2' });

// Create the DynamoDB service object
const ddb = new AWS.DynamoDB({ apiVersion: '2012-10-08' });

/* INTENT HANDLERS */

const LaunchRequestHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'LaunchRequest';
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak('Welcome to Phoenix at your Service. I will help you with all your City of Phoenix questions or requests. You can say something like "I need a new recycle container" or "I need to transfer my water services".')
      .reprompt('You can say something like "I need a new recycle container"')
      .getResponse();
  },
};


const InProgressContainerIntent = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;

    return (
      request.type === 'IntentRequest'
      && request.intent.name === 'ContainerIntent'
      && request.dialogState !== 'COMPLETED'
    ) || (
        request.type === 'IntentRequest'
        && request.intent.name === 'ContainerIntent'
        && request.dialogState === 'COMPLETED'
        && request.intent.slots['postalAddress']
        && request.intent.slots['postalAddress'].value
        && hardcodedPostalAddress.indexOf(request.intent.slots['postalAddress'].value.toLowerCase()) === -1
      );
  },
  handle(handlerInput) {
    const currentIntent = handlerInput.requestEnvelope.request.intent;
    let prompt = '';

    for (const slotName of Object.keys(handlerInput.requestEnvelope.request.intent.slots)) {
      const currentSlot = currentIntent.slots[slotName];
      if (currentSlot.confirmationStatus !== 'CONFIRMED'
        && currentSlot.resolutions
        && currentSlot.resolutions.resolutionsPerAuthority[0]) {
        if (currentSlot.resolutions.resolutionsPerAuthority[0].status.code === 'ER_SUCCESS_MATCH') {
          /**
           * If multiple resolutions are found, request the user to specify between the
           * matched results.
           */
          if (currentSlot.resolutions.resolutionsPerAuthority[0].values.length > 1) {
            prompt = 'Which would you like to do,';
            const size = currentSlot.resolutions.resolutionsPerAuthority[0].values.length;

            currentSlot.resolutions.resolutionsPerAuthority[0].values
              .forEach((element, index) => {
                prompt += ` ${(index === size - 1) ? ' or' : ' '} ${element.value.name}`;
                /**
                 * If 'containerAction', should say something like...
                 * 'Which would you like to do, replace a broken container or replace a
                 * missing contrainer'
                 */
                if (currentSlot.name === 'containerAction') {
                  prompt += ` container`
                }

              });

            prompt += '?';

            return handlerInput.responseBuilder
              .speak(prompt)
              .reprompt(prompt)
              .addElicitSlotDirective(currentSlot.name)
              .getResponse();
          }
        } else if (currentSlot.resolutions.resolutionsPerAuthority[0].status.code === 'ER_SUCCESS_NO_MATCH') {
          if (requiredSlots.indexOf(currentSlot.name) > -1) {
            prompt = `What ${currentSlot.name} are you looking for`;

            return handlerInput.responseBuilder
              .speak(prompt)
              .reprompt(prompt)
              .addElicitSlotDirective(currentSlot.name)
              .getResponse();
          }
        }
      } else if ((currentSlot.name === 'postalAddress' && !currentSlot.value) ||
        (currentSlot.name === 'postalAddress' && hardcodedPostalAddress.indexOf(currentSlot.value.toLowerCase()) === -1)
      ) {
        if (currentSlot.value) {
          /**
           * hardcodedPostalAddress should be a service call to City of Phoenix to get the list of addresses registered with the accountId.
           * */
          prompt = `The resolved address at ${currentSlot.value} is not one of your addresses linked to your accounts. Please use one of the following:`
          const size = hardcodedPostalAddress.length;
          hardcodedPostalAddress.forEach((element, index) => {
            prompt += ` ${(index === size - 1) ? ' or' : ' '} ${element}`;
          });
        } else {
          prompt = `Which street address is this for, please? `
        }



        return handlerInput.responseBuilder
          .speak(prompt)
          .reprompt(prompt)
          .addElicitSlotDirective(currentSlot.name)
          .getResponse();
      }
    }

    return handlerInput.responseBuilder
      .addDelegateDirective(currentIntent)
      .getResponse();
  },
};

const CompletedContainerIntent = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;

    return request.type === 'IntentRequest'
      && request.intent.name === 'ContainerIntent'
      && request.dialogState === 'COMPLETED'
      && hardcodedPostalAddress.indexOf(request.intent.slots['postalAddress'].value) !== -1
  },
  handle(handlerInput) {
    const filledSlots = handlerInput.requestEnvelope.request.intent.slots;

    const slotValues = getSlotValues(filledSlots);

    var speechOutput = `So you want to ${slotValues.containerAction.resolved} ${slotValues.container.resolved}, which is located ${slotValues.containerLocation.resolved} at the address ${slotValues.postalAddress.resolved}.`;

    /**
     * Here would be the POST request to City of Phoenix system to submit the request. It would
     * return an identifier to refer back to.
     */

    // Random number from 100,000 to 999,999
    var randomPhxId = (Math.floor(Math.random() * 899999) + 100000).toString();

    putPhxTicketWithAmazonId(
      randomPhxId,
      handlerInput.requestEnvelope.session.user.userId,
      `${slotValues.containerAction.resolved} ${slotValues.container.resolved} at the address ${slotValues.postalAddress.resolved}`
    ).then(
      function (data) {
        speechOutput += ` Your confirmation number is ${randomPhxId}`;
        return handlerInput.responseBuilder
          .speak(speechOutput)
          .getResponse();
      }, function (err) {
        speechOutput = ` Your request could not be submitted, please call 123-456-7890`;
        return handlerInput.responseBuilder
          .speak(speechOutput)
          .getResponse();
      }
    ).catch(function (e) {
      speechOutput = ` Your request could not be submitted, please call 123-456-7890`;

      return handlerInput.responseBuilder
        .speak(speechOutput)
        .getResponse();
    })

    speechOutput += ` Your confirmation number is ${randomPhxId}`;
    return handlerInput.responseBuilder
      .speak(speechOutput)
      .getResponse();
  }
};

const InProgressWaterTrashServicesIntent = {
  canHandle(handlerInput) {

    const request = handlerInput.requestEnvelope.request;

    if (request.type === 'IntentRequest' && request.intent.name === 'WaterTrashServicesIntent') {
      if (request.dialogState !== 'COMPLETED') {
        return true;
      } else {
        for (const slotName of Object.keys(request.intent.slots)) {
          const currentSlot = request.intent.slots[slotName];
          if (currentSlot.confirmationStatus !== 'CONFIRMED'
            && currentSlot.resolutions
            && currentSlot.resolutions.resolutionsPerAuthority[0]) {
            if (currentSlot.resolutions.resolutionsPerAuthority[0].status.code === 'ER_SUCCESS_NO_MATCH') {
              return true;
            }
          }
        }
        if (request.intent.slots['postalAddress'] && request.intent.slots['postalAddress'].value && hardcodedPostalAddress.indexOf(request.intent.slots['postalAddress'].value) === -1) {
          return true;
        } else if (request.intent.slots['waterTrashServicesAction'].resolutions.resolutionsPerAuthority[0].values && request.intent.slots['waterTrashServicesAction'].resolutions.resolutionsPerAuthority[0].values[0].value.name === 'transfer services' && !request.intent.slots['transferStartDate'].value) {
          return true;
        } else {
          return false;
        }

      }
    }
    return false;
  },
  handle(handlerInput) {

    const currentIntent = handlerInput.requestEnvelope.request.intent;
    let prompt = '';
    let isTransfer = false;
    for (const slotName of Object.keys(handlerInput.requestEnvelope.request.intent.slots)) {
      const currentSlot = currentIntent.slots[slotName];
      if (currentSlot.confirmationStatus !== 'CONFIRMED'
        && currentSlot.resolutions
        && currentSlot.resolutions.resolutionsPerAuthority[0]) {
        if (currentSlot.resolutions.resolutionsPerAuthority[0].status.code === 'ER_SUCCESS_MATCH') {
          /**
           * If multiple resolutions are found, request the user to specify between the
           * matched results.
           */
          if (currentSlot.resolutions.resolutionsPerAuthority[0].values.length > 1) {
            prompt = 'Which would you like to do,';
            const size = currentSlot.resolutions.resolutionsPerAuthority[0].values.length;

            currentSlot.resolutions.resolutionsPerAuthority[0].values
              .forEach((element, index) => {
                prompt += ` ${(index === size - 1) ? ' or' : ' '} ${element.value.name}`;
              });

            prompt += '?';

            return handlerInput.responseBuilder
              .speak(prompt)
              .reprompt(prompt)
              .addElicitSlotDirective(currentSlot.name)
              .getResponse();
          }
          if (currentSlot.name === 'waterTrashServicesAction' && currentSlot.resolutions.resolutionsPerAuthority[0].values[0].value.name === 'transfer services') {
            isTransfer = true;
          }
        } else if (currentSlot.resolutions.resolutionsPerAuthority[0].status.code === 'ER_SUCCESS_NO_MATCH') {
          if (requiredSlots.indexOf(currentSlot.name) > -1) {
            prompt = `What ${currentSlot.name} are you looking for`;

            return handlerInput.responseBuilder
              .speak(prompt)
              .reprompt(prompt)
              .addElicitSlotDirective(currentSlot.name)
              .getResponse();
          }
        }
      } else if (
        (
          currentSlot.name === 'postalAddress'
          && !currentSlot.value
        ) ||
        (
          currentSlot.name === 'postalAddress'
          && hardcodedPostalAddress.indexOf(currentSlot.value.toLowerCase()) === -1
        )
      ) {
        if (currentSlot.value) {
          /**
           * hardcodedPostalAddress should be a service call to City of Phoenix to get the list of addresses registered with the accountId.
           * */
          prompt = `The resolved address at ${currentSlot.value} is not one of your addresses linked to your accounts. Please use one of the following:`
          const size = hardcodedPostalAddress.length;
          hardcodedPostalAddress.forEach((element, index) => {
            prompt += ` ${(index === size - 1) ? ' or' : ' '} ${element}`;
          });
        } else {
          prompt = `Which street address is this for, please? `
        }
        return handlerInput.responseBuilder
          .speak(prompt)
          .reprompt(prompt)
          .addElicitSlotDirective(currentSlot.name)
          .getResponse();
      }
    }

    if (isTransfer && !currentIntent.slots['transferStartDate'].value) {
      return handlerInput.responseBuilder
        .speak('Please enter the start date of the service transfer')
        .reprompt('Please enter the start date of the service transfer')
        .addElicitSlotDirective('transferStartDate')
        .getResponse();
    }


    return handlerInput.responseBuilder
      .addDelegateDirective(currentIntent)
      .getResponse();
  },
};

const CompletedWaterTrashServicesIntent = {
  canHandle(handlerInput) {

    const request = handlerInput.requestEnvelope.request;
    if (request.type === 'IntentRequest'
      && request.intent.name === 'WaterTrashServicesIntent'
      && request.dialogState === 'COMPLETED') {
      if (hardcodedPostalAddress.indexOf(request.intent.slots['postalAddress'].value.toLowerCase()) !== -1
        && request.intent.slots['waterTrashServicesAction'].resolutions
        && request.intent.slots['waterTrashServicesAction'].resolutions.resolutionsPerAuthority[0].values
        && request.intent.slots['waterTrashServicesAction'].resolutions.resolutionsPerAuthority[0].values[0].value.name !== 'transfer services') {
        return true;
      } else if (hardcodedPostalAddress.indexOf(request.intent.slots['postalAddress'].value.toLowerCase()) !== -1
        && request.intent.slots['waterTrashServicesAction'].resolutions
        && request.intent.slots['waterTrashServicesAction'].resolutions.resolutionsPerAuthority[0].values
        && request.intent.slots['waterTrashServicesAction'].resolutions.resolutionsPerAuthority[0].values[0].value.name === 'transfer services'
        && request.intent.slots['transferStartDate'].value !== null) {
        return true;
      }
    }

    return false;
  },
  async handle(handlerInput) {
    const filledSlots = handlerInput.requestEnvelope.request.intent.slots;

    const slotValues = getSlotValues(filledSlots);


    var speechOutput = `${slotValues.waterTrashServicesAction.resolved} at your ${slotValues.property.resolved} location
    , which is located at ${slotValues.postalAddress.resolved}`;

    if (filledSlots['waterTrashServicesAction'].value === 'transfer services') {
      speechOutput += ` starting on ${slotValues.transferStartDate.resolved} to ${slotValues.mainDate.resolved}.`
    } else {
      speechOutput += ` on ${slotValues.mainDate.resolved}.`
    }

    /**
     * Here would be the POST request to City of Phoenix system to submit the request. It would
     * return an identifier to refer back to.
     */

    // Random number from 100,000 to 999,999
    var randomPhxId = (Math.floor(Math.random() * 899999) + 100000).toString();

    putPhxTicketWithAmazonId(
      randomPhxId,
      handlerInput.requestEnvelope.session.user.userId,
      speechOutput).then(
        function (data) {
          speechOutput += ` Your confirmation number is ${randomPhxId}`;
          return handlerInput.responseBuilder
            .speak(speechOutput)
            .getResponse();
        }, function (err) {
          speechOutput = ` Your request could not be submitted, please call 123-456-7890`;

          return handlerInput.responseBuilder
            .speak(speechOutput)
            .getResponse();
        }
      ).catch(function (e) {
        speechOutput = ` Your request could not be submitted, please call 123-456-7890`;

        return handlerInput.responseBuilder
          .speak(speechOutput)
          .getResponse();
      })

    speechOutput = 'So you want to ' + speechOutput + ` Your confirmation number is ${randomPhxId}`;
    return handlerInput.responseBuilder
      .speak(speechOutput)
      .getResponse();

  }
};

const StartedTicketStatusIntent = {
  canHandle(handlerInput) {

    const request = handlerInput.requestEnvelope.request;
    if (request.type === 'IntentRequest'
      && request.intent.name === 'TicketStatusIntent'
      && request.dialogState === 'STARTED') {
      return true;
    }

    return false;
  },
  async handle(handlerInput) {

    getPhxTicketWithAmazonId(handlerInput.requestEnvelope.session.user.userId).then(
      function (data) {
        console.log(JSON.stringify(data));
        return handlerInput.responseBuilder
          .speak('data 1')
          .getResponse();
      }, function (err) {
        console.log(JSON.stringify(err));
        return handlerInput.responseBuilder
          .speak('data 2')
          .getResponse();
      }
    ).catch(function (e) {
      console.log(JSON.stringify(e));
      return handlerInput.responseBuilder
        .speak('data 3')
        .getResponse();
    });
    return handlerInput.responseBuilder
      .speak('You have 10 tickets open, would you like to hear them?')
      .reprompt('You have 10 tickets open, would you like to hear them?')
      .addElicitSlotDirective('yesNo')
      .getResponse();

  }
};

const CompletedTicketStatusIntent = {
  canHandle(handlerInput) {

    const request = handlerInput.requestEnvelope.request;
    if (request.type === 'IntentRequest'
      && request.intent.name === 'TicketStatusIntent'
      && request.dialogState === 'COMPLETED') {
      return true;
    }

    return false;
  },
  handle(handlerInput) {

    return handlerInput.responseBuilder
      .speak('You have 10 tickets open, would you like to hear them?')
      .reprompt('You have 10 tickets open, would you like to hear them?')
      .addElicitSlotDirective('yesNo')
      .getResponse();

  }
};

const HelpHandler = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;

    return request.type === 'IntentRequest'
      && request.intent.name === 'AMAZON.HelpIntent';
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak('This is Phoenix at your service, provided by the City of Phoenix. I can help you with all your city of Phoenix requests.')
      .reprompt('What can Phoenix at your service do for you today? Start or transfer your water services? Request an organics container?')
      .getResponse();
  },
};

const ExitHandler = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;

    return request.type === 'IntentRequest'
      && (request.intent.name === 'AMAZON.CancelIntent'
        || request.intent.name === 'AMAZON.StopIntent');
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak('Have a great day.')
      .getResponse();
  },
};

const SessionEndedRequestHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'SessionEndedRequest';
  },
  handle(handlerInput) {
    console.log(`Session ended with reason: ${handlerInput.requestEnvelope.request.reason}`);

    return handlerInput.responseBuilder.getResponse();
  },
};

const hardcodedPostalAddress = [
  "1234 north random street",
  "1234 south random street"
]

const ErrorHandler = {
  canHandle() {
    return true;
  },
  handle(handlerInput, error) {
    console.log(`Error handled: ${error.message}`);

    return handlerInput.responseBuilder
      .speak('Sorry, I can\'t understand the command. Please say again.')
      .reprompt('Sorry, I can\'t understand the command. Please say again.')
      .getResponse();
  },
};

/* CONSTANTS */

const skillBuilder = Alexa.SkillBuilders.custom();

const requiredSlots = [
  'container',
  'containerAction',
  'containerLocation'
];

/* HELPER FUNCTIONS */

function getSlotValues(filledSlots) {
  const slotValues = {};
  Object.keys(filledSlots).forEach((item) => {
    const name = filledSlots[item].name;

    if (filledSlots[item] &&
      filledSlots[item].resolutions &&
      filledSlots[item].resolutions.resolutionsPerAuthority[0] &&
      filledSlots[item].resolutions.resolutionsPerAuthority[0].status &&
      filledSlots[item].resolutions.resolutionsPerAuthority[0].status.code) {
      switch (filledSlots[item].resolutions.resolutionsPerAuthority[0].status.code) {
        case 'ER_SUCCESS_MATCH':
          slotValues[name] = {
            synonym: filledSlots[item].value,
            resolved: filledSlots[item].resolutions.resolutionsPerAuthority[0].values[0].value.name,
            isValidated: true,
          };
          break;
        case 'ER_SUCCESS_NO_MATCH':
          slotValues[name] = {
            synonym: filledSlots[item].value,
            resolved: filledSlots[item].value,
            isValidated: false,
          };
          break;
        default:
          break;
      }
    } else {
      slotValues[name] = {
        synonym: filledSlots[item].value,
        resolved: filledSlots[item].value,
        isValidated: false,
      };
    }
  }, this);

  return slotValues;
}

function putPhxTicketWithAmazonId(phxTicketId, amazonId, message) {
  var params = {
    TableName: 'phx-at-your-service',
    Item: {
      'PHX_TICKET_ID': { S: phxTicketId },
      'AMAZON_USER_ID': { S: amazonId },
      'STATUS': { S: 'PENDING' },
      'TICKET_MESSAGE': { S: message },
    }
  };

  // Call DynamoDB to add the item to the table
  return new Promise(function (resolve, reject) {
    ddb.putItem(params, function (err, data) {
      if (err) {
        console.log("Error", err);
        reject(err);
      } else {
        console.log("Success", data);
        resolve(data);
      }
    });
  })
}

function getPhxTicketWithAmazonId(amazonId) {
  var params = {
    Key: {
      "AMAZON_USER_ID": {
        S: amazonId
      }
    },
    TableName: 'phx-at-your-service',
  };
  return new Promise(function (resolve, reject) {
    dynamodb.getItem(params, function (err, data) {
      if (err) {
        console.log(err, err.stack);
        reject(err);
      } else {
        console.log(data);
        resolve(data);
      };
    });
  });
}

exports.handler = skillBuilder
  .addRequestHandlers(
    LaunchRequestHandler,
    InProgressContainerIntent,
    CompletedContainerIntent,
    InProgressWaterTrashServicesIntent,
    CompletedWaterTrashServicesIntent,
    StartedTicketStatusIntent,
    HelpHandler,
    ExitHandler,
    SessionEndedRequestHandler,
    CompletedTicketStatusIntent)
  .addErrorHandlers(ErrorHandler)
  .lambda();
