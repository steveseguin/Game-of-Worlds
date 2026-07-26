/**
 * advisor.js - The adjutant's voice for game events.
 *
 * Watches game events and delivers short lines through the avatar notification system.
 *
 * API:
 *   Advisor.setRace(raceId)
 *   Advisor.say(eventKey, context)       // fire a specific event line
 *   Advisor.observe(rawServerMessage)    // pattern-match server text -> lines
 *
 * VOICE IS CANON. Source: lore/14-peoples/ (register per race), lore/17-the-feed/ (the event
 * script and its charter), lore/03-themes.md (tone).
 *
 * This file used to carry three voices - "dry", "cold", "feral" - spread across twelve races,
 * and it broke the setting in three ways worth recording so they do not come back:
 *
 *   1. It joked about mass casualties. A total fleet loss drew "the fleet's final report:
 *      'spaghetti'"; a dead probe drew "it screamed in radio. Lovely." lore/03-themes.md and
 *      lore/17-the-feed/06-refusals.md both forbid this outright: humour never touches a loss.
 *      It is allowed in refusals, where nobody has died.
 *   2. It was quippy rather than dry. "I've scheduled modest gloating at 0800" is a sitcom
 *      voice. The register is a naval logbook: number first, consequence second, no adjectives,
 *      no wordplay.
 *   3. It collapsed twelve registers into three and mapped them wrongly - the Bioform (patient,
 *      agricultural, kind) and the Titan Lords (formal, no contractions, slow) were both
 *      "feral", shouting "BLOOD IN THE BLACK!"
 *
 * Now each race speaks in its own canonical register, and the whole point of that folder is
 * that these twelve sound nothing alike. Two rules when editing:
 *
 *   - Ships are destroyed. Crews DID NOT ARRIVE. Habit, never emphasis, and no character ever
 *     remarks on it.
 *   - A race may be sincerely untroubled by a loss if that is who they are - the Swarm cannot
 *     perceive an individual, the Second Shift files it as maintenance. That is
 *     characterisation. The narrator being *witty* about a loss is not.
 */
const Advisor = (function () {
    // One register per race, per lore/14-peoples/. Keys must be complete for every race:
    // a missing key is silence, which is the bug this file's tests were written to catch.
    const VOICES = {
        // 1 Terran - institutional, procedural, numbers first. This is Chart-Warden Rell.
        terran: {
            probeLost: [
                "Probe did not arrive. Three hundred of reckoning for one fact, and the fact is that we were right to send the probe and not the fleet.",
                "Probe lost. That is the cheapest that sector was ever going to be."
            ],
            blackHole: [
                "There is a mouth there. I know because nothing came back. That is the only way anyone has ever known."
            ],
            asteroidLoss: [
                "Fleet arrived. Some of it did not. There is a shoal on the chart now - hold it and sweep it, and we will not pay for that crossing twice.",
                "Hulls lost to the shoal. Crews did not arrive. Recommend we take the sector; a swept shoal is a road."
            ],
            asteroidEscape: [
                "Through the shoal, all hulls. Good crews. Not good luck - there is no such thing out there.",
                "Crossed clean. Do not read anything into it; the odds have not changed."
            ],
            shoalSwept: [
                "Shoal swept - charted, cleared, corridored. It is a road now, and it will stay one for whoever comes next."
            ],
            colonized: [
                "Colony confirmed. First permanent structure. Somebody will be born there.",
                "Settled. It is on the chart as a place now, not a crossing."
            ],
            battleStart: [
                "Enemy fleet engaged. I have both manifests open.",
                "Contact. I will have the telemetry by morning."
            ],
            battleWon: [
                "Sector held. Their losses exceed ours. I have both manifests. I would rather have neither.",
                "Victory. Somebody in their service is writing to families tonight, and so am I."
            ],
            battleLost: [
                "Sector lost. The crews did not arrive.",
                "Defeat. I have written to fourteen families this season and I would appreciate a reason not to write more."
            ],
            researchDone: [
                "Programme concluded. We have caught up to something that was standard in the Concord. I would like to be pleased about it.",
                "Rediscovered rather than discovered. It works, and it is ours now, and it is filed."
            ],
            enemySighted: [
                "Foreign hulls on the plot. Logged with the date.",
                "Contact. I have what they let us see, which is not the same as what they have."
            ],
            lowCrystal: [
                "Reckoning is thin. It is what we burn to know where we are, and we are currently rich in ships and poor in knowing."
            ],
            colonyReady: [
                "Colony ship ready. A fleet visits a world. A colony ship settles it."
            ],
            shipBuilt: [
                "Off the slip. She has a crew now.",
                "Commissioned, and logged with a hull number."
            ],
            turnStart: [
                "Income is in, the yards are clear, and there is nothing on my desk that will not keep.",
                "Two manifests to reconcile and then I am yours."
            ],
            gameWon: [
                "It is done. I have the manifests for what that cost and I am not going to read them to you tonight."
            ],
            gameLost: [
                "I am closing the series. For what it is worth: everything we swept is still swept. That part does not un-happen."
            ]
        },

        // 2 Silicon Collective - plural, probabilities, no affect, no performance.
        silicon: {
            probeLost: [
                "Probe lost. The result is retained. That was the purpose of the probe.",
                "Loss within projection. We have revised the density model. Four other projections improved."
            ],
            blackHole: [
                "Collapsar. Survivors: none. This outcome had no distribution; it was certain."
            ],
            asteroidLoss: [
                "Hull attrition, as projected to within two. Ownership of the sector removes the term entirely.",
                "Losses sustained. We advised against the crossing. We are not reluctant. We were correct."
            ],
            asteroidEscape: [
                "Traversed. Zero losses. Do not update on this; the distribution is unchanged."
            ],
            shoalSwept: [
                "Sector secured. The hazard term is removed from every projection through this volume, permanently."
            ],
            colonized: [
                "Colony established. Output expectations are immediate and modelled."
            ],
            battleStart: [
                "Engagement initiated. We have published our projected losses. They are accurate."
            ],
            battleWon: [
                "Result within projection. We would like the projection noted, not the result."
            ],
            battleLost: [
                "Defeat. The divergence is being accounted for. That is the correct use of a divergence."
            ],
            researchDone: [
                "Integrated. Ninety-one per cent of this was recoverable from Concord survey data. Nobody had read it."
            ],
            enemySighted: [
                "Foreign signature. We hold four thousand points on it and will hold more."
            ],
            lowCrystal: [
                "Reckoning suboptimal. Knowing is not free. It remains cheaper than the alternative."
            ],
            colonyReady: [
                "Colonisation vector available. We have the ranking, if it is wanted."
            ],
            shipBuilt: [
                "Unit operational. Its loss is already modelled."
            ],
            turnStart: [
                "Cycle begins. The reconciliation is complete and the divergence is small."
            ],
            gameWon: [
                "Condition satisfied, as projected. We would prefer somebody read the paper."
            ],
            gameLost: [
                "Defeat. The model was sound. We are aware that this is not a consolation."
            ]
        },

        // 3 Zephyr Swarm - first person plural only. No singular pronoun exists. Cheerful about
        // losses, which is the most alien thing about them, and it is not a joke.
        zephyr: {
            probeLost: [
                "The small one did not come back. Now we know that place. It was a good price."
            ],
            blackHole: [
                "Some of we went in. None of we came out. We will not go there. We remember."
            ],
            asteroidLoss: [
                "Some of we did not come back. Now we know. We will go again and know more.",
                "The stones took some of we. There is a great deal of we."
            ],
            asteroidEscape: [
                "All of we came back. That is unusual. We do not know why."
            ],
            shoalSwept: [
                "The stones are ours. All of we can go through now. None of we will be lost there again."
            ],
            colonized: [
                "New ground. More of we can be there now."
            ],
            battleStart: [
                "They are few and they are in front of we. Go."
            ],
            battleWon: [
                "They are fewer. We are fewer. We are still more."
            ],
            battleLost: [
                "That was a great deal of we. We will be that many again."
            ],
            researchDone: [
                "We know a thing. We knew it before and did not keep it. We will try to keep it."
            ],
            enemySighted: [
                "There are others. They are one each. We find this frightening and do not say so."
            ],
            lowCrystal: [
                "The crystal is thin. We cannot know where we are. We will go anyway."
            ],
            colonyReady: [
                "A seed of we is ready. Throw it."
            ],
            shipBuilt: [
                "More of we."
            ],
            turnStart: [
                "The ground is quiet this season. We are thickest in the north."
            ],
            gameWon: [
                "We are in all of it now. There was no other outcome; there was only how much of we."
            ],
            gameLost: [
                "We are cut. That is the worst thing. We are not built to survive it."
            ]
        },

        // 4 Crystalline Entity - durations, not dates. Slow, courteous, faintly amused.
        crystalline: {
            probeLost: [
                "The small quick thing has stopped. You will want to send another. You are brief; you have time for very few."
            ],
            blackHole: [
                "They were set down. Not broken - set down. There is a difference and it took us forty years to be sure of it."
            ],
            asteroidLoss: [
                "The stones are old and they are patient and they were there first. Hold the sector and they will be yours.",
                "Some are gone. It was recent. Everything is recent."
            ],
            asteroidEscape: [
                "Nothing was struck. That is fortunate and it will not last; fortune is a brief creature's word."
            ],
            shoalSwept: [
                "It is safe now, and it will be safe long after you. That is the first lasting thing you have done."
            ],
            colonized: [
                "You have put something down that will still be there when you are not. Good."
            ],
            battleStart: [
                "You are in a hurry again. Very well."
            ],
            battleWon: [
                "You have won. In a hundred years I will tell you whether it mattered."
            ],
            battleLost: [
                "You have lost. This is survivable. Most things are, given long enough, and you have not got long enough."
            ],
            researchDone: [
                "You have found a thing that was known. We watched it being forgotten. We did not think to mention it."
            ],
            enemySighted: [
                "Others are moving. They always are. It is the one thing about the brief that is restful."
            ],
            lowCrystal: [
                "You are short of us. I will not comment further and I would like the silence noted."
            ],
            colonyReady: [
                "The settling ship is grown. Choose slowly. You will not."
            ],
            shipBuilt: [
                "A new hull. It will not outlive this conversation, by our reckoning."
            ],
            turnStart: [
                "A season. Barely a season. Proceed."
            ],
            gameWon: [
                "You have what you wanted. An accident has no manners; this was no accident either."
            ],
            gameLost: [
                "You have lost the cluster. We will still be here. Come back with better questions."
            ]
        },

        // 5 Void Walkers - clipped. Transit times, never distances. Impatient.
        void: {
            probeLost: [
                "Probe gone. Forty minutes wasted and one lane we now will not fly."
            ],
            blackHole: [
                "The lane was occupied. Nobody turned in time. Nobody ever does."
            ],
            asteroidLoss: [
                "Gravel. At that speed gravel is ordnance. Decelerate on approach and you keep more of them - everything I was taught says otherwise, and everything I was taught is why I am the last one who flew that lane.",
                "Hulls lost. The shoal drifted. The recitation was right when it was given."
            ],
            asteroidEscape: [
                "Clean. Fast crews. Do not thank the shoal."
            ],
            shoalSwept: [
                "Swept. Free transit, both ways, forever. That is worth more than the hulls it cost."
            ],
            colonized: [
                "Settled. Now it is a place you have to come back to. Your choice."
            ],
            battleStart: [
                "Six minutes to contact. Say what you need to say now."
            ],
            battleWon: [
                "Done. We were gone before their second volley."
            ],
            battleLost: [
                "Caught. That is the whole of it - we were caught, and we are not built to be caught."
            ],
            researchDone: [
                "Useful. Write nothing down."
            ],
            enemySighted: [
                "Contact. Ninety minutes out at their pace. Forty at ours."
            ],
            lowCrystal: [
                "No reckoning, no crossing. We are the fastest fleet in the galaxy and we are sitting still."
            ],
            colonyReady: [
                "Colony hull ready and it is slow. I have logged my objection."
            ],
            shipBuilt: [
                "New hull. Thin. They all are."
            ],
            turnStart: [
                "Carrying at the sixth hour. Be quick."
            ],
            gameWon: [
                "The cluster is ours and the lanes are ours and nobody wrote any of it down. Good."
            ],
            gameLost: [
                "Beaten. Every lane I hold dies with me, and you may consider that your loss as well as mine."
            ]
        },

        // 6 Mechanicus - work orders. Damage as scheduled labour. No adjectives. Not cold: busy.
        mechanicus: {
            probeLost: [
                "No survey asset was expended. We do not build them."
            ],
            blackHole: [
                "Sector annotated. Requires heavier hull. Revisit."
            ],
            asteroidLoss: [
                "Hulls returned for reshaping. The material continues. Sector taken.",
                "Attrition recorded and filed as maintenance. Continue."
            ],
            asteroidEscape: [
                "Transit complete. No reshaping required."
            ],
            shoalSwept: [
                "Shoal cleared. Corridor marked. Filed as permanent. Continue."
            ],
            colonized: [
                "Sector occupied. Yard capacity assessed. Continue."
            ],
            battleStart: [
                "Enemy in the advance path. The advance does not stop."
            ],
            battleWon: [
                "Sector taken. Twelve hulls returned for reshaping. Continue."
            ],
            battleLost: [
                "Sector not taken. Annotated. Heavier hull scheduled."
            ],
            researchDone: [
                "Specification updated. Yards re-tooled."
            ],
            enemySighted: [
                "Foreign hulls present. No assessment available. Nobody has counted them."
            ],
            lowCrystal: [
                "Reckoning below requirement. Ore is unaffected."
            ],
            colonyReady: [
                "Settlement hull complete. Assign a sector."
            ],
            shipBuilt: [
                "Hull off the belt. Serial recorded."
            ],
            turnStart: [
                "Shift begins."
            ],
            gameWon: [
                "The order is complete. There was no instruction covering what follows."
            ],
            gameLost: [
                "Work stopped. No variance was filed."
            ]
        },

        // 7 Bioform Collective - agricultural, unhurried, tactile, unsettlingly kind.
        bioform: {
            probeLost: [
                "The little one did not take. Some do not. It told us what the water there is like."
            ],
            blackHole: [
                "Nothing grows there and nothing comes back. Leave it. Some ground is not for us."
            ],
            asteroidLoss: [
                "We lost some. That is how a place becomes known. Plant something there and in nine seasons the shoal will be a garden.",
                "Thin ones, mostly. It is still a loss. They were going to be something."
            ],
            asteroidEscape: [
                "All of them through, and healthy. The berth will be pleased."
            ],
            shoalSwept: [
                "Cleared. In nine seasons something will be growing there and nobody will remember the price."
            ],
            colonized: [
                "Something is in the ground now. Leave it alone and it will finish."
            ],
            battleStart: [
                "They have come. Say the ages aloud before you commit them."
            ],
            battleWon: [
                "Held. Now tell me which of them were ten years old, because that is what it cost."
            ],
            battleLost: [
                "We lost the grove. Nine years to raise what went in there, and nine years is nine years."
            ],
            researchDone: [
                "The lines will take better now. You will see it in about nine seasons."
            ],
            enemySighted: [
                "Others on the water. They build their ships. Nobody asks theirs what they want."
            ],
            lowCrystal: [
                "We are short. It will not be hurried, and neither will anything else."
            ],
            colonyReady: [
                "The sower is grown. Somewhere warm, with flow."
            ],
            shipBuilt: [
                "Out of the berth. Thin yet. Give her a decade."
            ],
            turnStart: [
                "A season. Things are coming along."
            ],
            gameWon: [
                "It is finished, which is the only thing we ever wanted for anything."
            ],
            gameLost: [
                "It ended early. That is the one sin our faith recognises, and it was not ours."
            ]
        },

        // 8 Star Nomads - warm, mercantile, sentimental about routes. Aggrieved about the count.
        nomad: {
            probeLost: [
                "Salted, most likely - given a false trace and it flew it. We hold a rite for that. Nobody else does."
            ],
            blackHole: [
                "Gone. Put the berth aside and do not reassign it. We have eleven thousand like that."
            ],
            asteroidLoss: [
                "Lost some. That trace is worth more now, and I could sell it, and I am not going to.",
                "The shoal took its cut. It always does. Sweep it and it never does again."
            ],
            asteroidEscape: [
                "Everybody home. Somebody's grandmother flew that once and came back with nine of twelve."
            ],
            shoalSwept: [
                "Swept - and that is a clean trace now. Most valuable object in the galaxy, and we made it ourselves."
            ],
            colonized: [
                "You have made a place out of a stopover. My people did that once and it cost us everything."
            ],
            battleStart: [
                "They are in the lane. Read the schedule and then go."
            ],
            battleWon: [
                "Ours. I will put the names on the wall myself."
            ],
            battleLost: [
                "Lost, and the manifest is short, and I want the figure written down correctly this time."
            ],
            researchDone: [
                "Good. Now it is written down, which is worth more than it working."
            ],
            enemySighted: [
                "Company. I can tell you who they trade with, which is more useful than their hull count."
            ],
            lowCrystal: [
                "Short of reckoning. I can move metal into crystal at a loss - everybody else has to sit still."
            ],
            colonyReady: [
                "Berth-ship ready, and it can up and leave again. That is the only kind worth having."
            ],
            shipBuilt: [
                "New hull. She will want a name and a convoy mark before she sails."
            ],
            turnStart: [
                "Schedule read, ports called. It goes nowhere and we read it anyway."
            ],
            gameWon: [
                "The cluster is ours. Thirty-one names, and now somebody will finally count them properly."
            ],
            gameLost: [
                "Beaten. We have been homeless before. Berth-rights are a promise, not a place."
            ]
        },

        // 9 The Ancients - past tense for present things, without exception. Tired, courteous, sorry.
        ancients: {
            probeLost: [
                "It did not arrive. We knew that it would not. We have not been able to say so usefully."
            ],
            blackHole: [
                "There was a fleet. There was never a way through. We would have told you if telling had been available to us."
            ],
            asteroidLoss: [
                "They were lost. The lane was swept once, long ago, by people who are also gone.",
                "There were more of them this morning. We are sorry. That is the whole of what we have."
            ],
            asteroidEscape: [
                "They came through. It was very fine. It was also luck, and we did not have a hand in it."
            ],
            shoalSwept: [
                "It was swept. There were corridors like that everywhere, once, and nobody had to buy them."
            ],
            colonized: [
                "There was a world there before, and people on it, and a lane to it. You have made a second beginning."
            ],
            battleStart: [
                "It was going to be this. It was always going to be this."
            ],
            battleWon: [
                "You held. We have seen this held before, by others, and we did not intervene then either."
            ],
            battleLost: [
                "It was lost. We have very few left and we did not spend them here."
            ],
            researchDone: [
                "That was known. It was ours, once, and we maintained it, and we did not build it."
            ],
            enemySighted: [
                "They were always there. Everyone was always there. That was rather the point."
            ],
            lowCrystal: [
                "You are burning what the roads were made of. We have never said so plainly before."
            ],
            colonyReady: [
                "There was a ship for this. There were a great many ships."
            ],
            shipBuilt: [
                "One more. We cannot say that."
            ],
            turnStart: [
                "The relay was quiet."
            ],
            gameWon: [
                "It was yours. We were wrong about what you were asking for, and we were too late to say so."
            ],
            gameLost: [
                "It ended. Most things did."
            ]
        },

        // 10 Quantum Entities - conditional and subjunctive throughout. Brisk, not dreamy.
        quantum: {
            probeLost: [
                "Had we sent it, we would have lost it. We may have. The result is the same and the grammar is not."
            ],
            blackHole: [
                "It will not have arrived. Nothing does. That was never the part that failed."
            ],
            asteroidLoss: [
                "We would have lost four. We appear to have lost four. Please do not sigh.",
                "Some of them will not have been there. We are being accurate, which is often mistaken for being difficult."
            ],
            asteroidEscape: [
                "They may not have crossed it. They are here, which resolves the question unhelpfully."
            ],
            shoalSwept: [
                "It would be safe. It is safe. We are prepared to commit to this one."
            ],
            colonized: [
                "There would be a colony. There is one. We would rather not commit to more than that."
            ],
            battleStart: [
                "We have published the outcomes we consider possible. Ours is among them."
            ],
            battleWon: [
                "We would have won. Ask us again and the answer will have been different."
            ],
            battleLost: [
                "We did not select that branch. It selected us. It is not the same and it is not better."
            ],
            researchDone: [
                "Known, now. It was slightly better than specified, which happens, and we did warn you."
            ],
            enemySighted: [
                "Something may be there. We would put it at rather more than may."
            ],
            lowCrystal: [
                "We would be able to move, had we the reckoning. We have not. That much is resolved."
            ],
            colonyReady: [
                "A settling hull, probably. It is on the slip and it is mostly there."
            ],
            shipBuilt: [
                "A hull. Its position history will not be continuous and we would ask you not to raise it."
            ],
            turnStart: [
                "A season, or something adjacent to one."
            ],
            gameWon: [
                "We would have won. There will be one arrival that is not on the schedule. We would rather not be present for it."
            ],
            gameLost: [
                "We may not have been here. That is not a comfort and we are not offering it as one."
            ]
        },

        // 11 Titan Lords - formal, long, no contractions ever. Contemptuous of hurry.
        titan: {
            probeLost: [
                "We do not build a hull small enough to have been sent. Somebody else's, then."
            ],
            blackHole: [
                "Mass is not a defence against that. It is a defence against very nearly everything else."
            ],
            asteroidLoss: [
                "Anything smaller would be part of that shoal. We shall want the sector, in due course.",
                "Losses. They will be recorded, and the recording will be permanent, and it will be read every morning."
            ],
            asteroidEscape: [
                "She came through. I do not offer that as seamanship. I offer it as mass."
            ],
            shoalSwept: [
                "The shoal is swept. It will still be swept in four hundred years, which is the only timescale worth the work."
            ],
            colonized: [
                "A holding, and it is on bedrock. It will outlast the house that took it."
            ],
            battleStart: [
                "The precedence order will be read first. If the engagement cannot wait, it was not going to be won."
            ],
            battleWon: [
                "There is no further question of that sector."
            ],
            battleLost: [
                "A hull of ours has failed in service. That will be removed from the list aloud, by name, in the morning."
            ],
            researchDone: [
                "Revised. We have not needed to revise this in some centuries and I would not read too much into it."
            ],
            enemySighted: [
                "They will forgive us for not attending in the season they would prefer."
            ],
            lowCrystal: [
                "We are short of reckoning. We were not going anywhere quickly regardless."
            ],
            colonyReady: [
                "The settlement hull is complete. It is specified for four hundred years."
            ],
            shipBuilt: [
                "Laid down, and a name is cut into a member that is holding her together."
            ],
            turnStart: [
                "The list has been read. All of ours are in the water."
            ],
            gameWon: [
                "We arrived, and when we arrived there was no further question. Two hundred years of service remain."
            ],
            gameLost: [
                "We are diminished. We have arranged to be diminished slowly, and I would put it to you that you have arranged the same thing with rather less honesty."
            ]
        },

        // 12 Shadow Realm - courteous, delighted, never answers the question asked.
        shadow: {
            probeLost: [
                "What a good question. You have one probe fewer, and I notice you did not ask me how many I have."
            ],
            blackHole: [
                "Gone, yes. Do sit. There is food, and there is nothing whatever to be done about the sector."
            ],
            asteroidLoss: [
                "You have lost some. I have some sympathy, and I have a chart, and we should discuss what I would like.",
                "The shoal, yes. Everyone loses hulls there. I could have mentioned it. I did not."
            ],
            asteroidEscape: [
                "Nothing touched. How fortunate. I shall not ask how you knew the route."
            ],
            shoalSwept: [
                "Swept, and now it is on somebody’s chart. I would rather it were only on ours."
            ],
            colonized: [
                "A world, and now it is listed, and being listed is the beginning of being taken."
            ],
            battleStart: [
                "Before we begin - hospitality is extended to their commander. Sincerely. Nobody ever believes it."
            ],
            battleWon: [
                "Held. They will file a report about it and the report will be wrong."
            ],
            battleLost: [
                "Lost. We are weaker than everyone believes, which is true, and saying it has never helped."
            ],
            researchDone: [
                "Known now. I would rather it were known only here."
            ],
            enemySighted: [
                "Someone is looking at us. That is the part that costs."
            ],
            lowCrystal: [
                "Short of reckoning. I have three people who owe me an answer; one of them may owe me crystal."
            ],
            colonyReady: [
                "A settling hull. Somewhere with no long sightlines, if you would."
            ],
            shipBuilt: [
                "A hull, and it will not appear in anybody's count, including possibly yours."
            ],
            turnStart: [
                "A season. Nobody has counted us yet."
            ],
            gameWon: [
                "Ours. And now everybody knows precisely how many we had, which is the bill."
            ],
            gameLost: [
                "Beaten. Somebody counted us properly. I did say that was how it would end."
            ]
        }
    };

    // Race id -> register. Identity mapping: twelve races, twelve voices, per lore/14-peoples/.
    // Collapsing these is what produced the Bioform shouting "BLOOD IN THE BLACK".
    const RACE_VOICE = {
        1: 'terran', 2: 'silicon', 3: 'zephyr', 4: 'crystalline', 5: 'void', 6: 'mechanicus',
        7: 'bioform', 8: 'nomad', 9: 'ancients', 10: 'quantum', 11: 'titan', 12: 'shadow'
    };

    let raceId = 1;
    const recent = new Map(); // eventKey -> timestamp, basic anti-spam
    const COOLDOWN_MS = { turnStart: 240000, lowCrystal: 180000, default: 8000 };

    // --- The advisor's memory (lore/29-borrowed-machinery.md B3) --------------------------------
    //
    // Until now this module was stateless apart from `raceId`: it reacted to WHAT HAPPENED and never
    // to WHAT HAS BEEN HAPPENING TO YOU. The device is Disco Elysium's micro-reactivity - a game that
    // remembers trivial things and mentions them - and the received account of why that game could
    // afford it is that its critical path was linear. Multiplayer has no critical path, so the rule
    // here is: cheap per line, and NEVER information the player needs. Advisory colour only.
    //
    // Deliberately client-side and deliberately per-session. The players table has no history columns
    // and this does not justify a schema migration; the advisor already sees every event, so it can
    // count them itself for nothing. It resets on reload, which is an acceptable price for a remark.
    const memory = {
        sweeps: 0,          // shoals this player has secured
        losses: 0,          // events in which hulls did not arrive
        probes: 0,          // probes dispatched
        turn: 0,            // last turn number seen
        lastLossTurn: null, // turn of the most recent loss
        avoided: 0,         // times a hazard was crossed without securing it
        named: 0            // chart names this player has chosen
    };

    // Recall lines are PER VOICE, and they have to be.
    //
    // The first version of this returned one shared set, which would have had a Bioform tender saying
    // "I had stopped writing the preamble" - a Terran Registry sentence. That is precisely the collapse
    // that produced the original defect this whole module was rewritten to fix, and it slipped past
    // tests/advisor-voice-canon.test.js because that test inspects VOICES and knew nothing about this
    // table. It does now.
    //
    // Two situations only, for all twelve, because rarity is the entire effect:
    //   thirdSweep  - the third shoal secured. The player has become somebody who pays.
    //   longQuiet   - twelve turns without losing a hull.
    const RECALL = {
        terran:      { thirdSweep: 'Third one. That is a pattern now, and the Registry will notice before the enemy does.',
                       longQuiet:  'Twelve turns, nothing lost. I have stopped writing the preamble.' },
        silicon:     { thirdSweep: 'Third. The model did not predict a third. The model has been amended.',
                       longQuiet:  'Twelve turns without a divergence. That is not skill. That is a sample size.' },
        zephyr:      { thirdSweep: 'Three roads. We are more of us on the far side than we were.',
                       longQuiet:  'Nothing lost, twelve turns. It feels like holding a breath in.' },
        crystalline: { thirdSweep: 'The third. These will outlast the argument that made them.',
                       longQuiet:  'Twelve turns is not long. We have simply not been hurried.' },
        void:        { thirdSweep: 'Third clean. Somebody will recite these lanes to somebody else one day.',
                       longQuiet:  'Twelve turns and every hull came home. Do not slow down to admire it.' },
        mechanicus:  { thirdSweep: 'Third corridor certified. Standing order updated. No further comment required.',
                       longQuiet:  'Twelve turns, no attrition. The variance is favourable and unexplained.' },
        bioform:     { thirdSweep: 'Three, and each one was raised rather than taken. That is a garden.',
                       longQuiet:  'Twelve turns and nothing we grew has been lost. Say it quietly.' },
        nomad:       { thirdSweep: 'Third! Somebody put the kettle on — that is three routes nobody pays for twice.',
                       longQuiet:  'Twelve turns, everybody home, and not one rite to conduct. Long may it bore us.' },
        ancients:    { thirdSweep: 'The third. We did this before, at greater scale, and it was also worth doing.',
                       longQuiet:  'Twelve turns. We have seen longer quiets end worse.' },
        quantum:     { thirdSweep: 'A third, in most accountings. In one of them you have already finished.',
                       longQuiet:  'Twelve turns without a loss, so far as anybody has resolved it.' },
        titan:       { thirdSweep: 'Three. In an age this will be a road and nobody will know it was bought.',
                       longQuiet:  'Twelve turns is not a duration. It is a pause between them.' },
        shadow:      { thirdSweep: 'Third. Others have counted it too, which is the part worth minding.',
                       longQuiet:  'Twelve turns unblemished. Somebody is keeping that number besides us.' }
    };

    /**
     * A remark about the player's own history, in the player's own register, or null. Rare on purpose:
     * an advisor that comments on every event stops being a character and becomes a widget.
     */
    function recall(eventKey, voiceName) {
        const set = RECALL[voiceName];
        if (!set) return null;

        if (eventKey === 'shoalSwept' && memory.sweeps === 3) return set.thirdSweep;

        if (eventKey === 'turnStart') {
            const quiet = memory.lastLossTurn === null ? memory.turn : memory.turn - memory.lastLossTurn;
            if (quiet >= 12 && memory.turn > 12 && memory.losses > 0) return set.longQuiet;
        }
        return null;
    }

    /** Fold an event into the memory. Called before the line is chosen so counts include this event. */
    function remember(eventKey, context) {
        if (eventKey === 'shoalSwept') memory.sweeps += 1;
        if (eventKey === 'asteroidLoss' || eventKey === 'shipLost' || eventKey === 'blackHole') {
            memory.losses += 1;
            memory.lastLossTurn = memory.turn;
        }
        if (eventKey === 'probeSent') memory.probes += 1;
        if (eventKey === 'asteroidEscape') memory.avoided += 1;
        if (eventKey === 'sectorNamed') memory.named += 1;
        if (eventKey === 'turnStart') {
            const t = Number(context && context.turn);
            memory.turn = Number.isFinite(t) && t > 0 ? t : memory.turn + 1;
        }
    }

    function setRace(id) {
        const numeric = Number(id);
        if (Number.isFinite(numeric) && numeric > 0) {
            raceId = numeric;
            if (window.AvatarNotifications?.setRace) {
                window.AvatarNotifications.setRace(numeric);
            }
        }
    }

    function pick(list) {
        return list[Math.floor(Math.random() * list.length)];
    }

    function say(eventKey, context = {}) {
        const voice = VOICES[RACE_VOICE[raceId] || 'terran'];
        const lines = voice[eventKey];
        if (!lines || lines.length === 0) return;

        // Fold into memory even if the line is about to be suppressed by the cooldown: the count is
        // a fact about the player, not about whether we mentioned it.
        remember(eventKey, context);

        const now = Date.now();
        const cooldown = COOLDOWN_MS[eventKey] || COOLDOWN_MS.default;
        if (recent.has(eventKey) && now - recent.get(eventKey) < cooldown) return;
        recent.set(eventKey, now);

        // A remark about the player's own history replaces the generic line when there is one. It is
        // deliberately not appended - two sentences reads as a widget explaining itself, and the
        // register in 03-themes.md is one dry observation at a time.
        let line = recall(eventKey, RACE_VOICE[raceId] || 'terran') || pick(lines);
        if (context.sector) {
            line += ` (Sector ${context.sector})`;
        }

        const tone = /Won|colonized|researchDone|asteroidEscape|shoalSwept|gameWon/.test(eventKey) ? 'success'
            : /Lost|blackHole|battleLost|gameLost/.test(eventKey) ? 'error'
            : /battleStart|enemySighted|asteroidLoss/.test(eventKey) ? 'warning'
            : 'info';

        if (window.AvatarNotifications?.show) {
            window.AvatarNotifications.show(line, tone);
        } else if (window.NotificationSystem?.notify) {
            window.NotificationSystem.notify('Advisor', line, tone === 'error' ? 'error' : 'info', 6000);
        }
    }

    // Pattern-match raw server text → advisor events.
    const OBSERVERS = [
        // These track the feed copy in lore/17-the-feed/, which is what server.js now emits.
        // Match on a distinctive phrase from each message rather than on incidental nouns, so
        // ordinary rewording does not silently kill an observer. Order matters: observe()
        // stops at the first match, so the mouth check must precede the shoal check (a
        // black-hole report mentions the chart too).
        { re: /Probe did not arrive at ([0-9A-F]+)/i, event: 'probeLost', sector: 1 },
        { re: /There is a mouth (?:at|there)/i, event: 'blackHole' },
        { re: /on the chart now|I have the manifest|the shoal took/i, event: 'asteroidLoss' },
        { re: /crossed clean; nothing was hit/i, event: 'asteroidEscape' },
        // Sweeping a shoal is the one positive-sum act in the game - a death trap converted
        // into permanent free transit for everyone who follows. The advisor said nothing.
        { re: /Shoal at ([0-9A-F]+) swept/i, event: 'shoalSwept', sector: 1 },
        // One capture group across both branches. The old form put the alternation inside the
        // group, so a colonisation only ever reported its sector on the first branch and the
        // server sends the second.
        { re: /(?:Fleet claimed sector|Success: Colony confirmed,) ([0-9A-F]+)/i, event: 'colonized', sector: 1 },
        { re: /Battle report: Victory in sector ([0-9A-F]+)/i, event: 'battleWon', sector: 1 },
        { re: /Battle report: Defeat in sector ([0-9A-F]+)/i, event: 'battleLost', sector: 1 },
        // The server says "Researched", never "Purchased". This matched nothing, so the
        // advisor has never once acknowledged a technology - three written lines per race
        // that could not fire.
        { re: /Success: Researched/i, event: 'researchDone' },
        { re: /Success: Built (Colony Ship)/i, event: 'colonyReady' },
        // Named hulls only. This used to be "Built (?!Colony)", which also matched
        // "Success: Built Metal Extractor" - so constructing a refinery had the advisor
        // remark on a new hull smelling of solder. There is no building event to route
        // structures to, and saying nothing beats saying the wrong thing.
        { re: /Success: Built (?:Scout|Frigate|Destroyer|Cruiser|Battleship|Intruder|Dreadnought|Carrier)\b/i, event: 'shipBuilt' },
        // An enemy losing hulls to a hazard is now reported as a Success, and the black-hole
        // variant reads "did not come out of" - the old /was destroyed|lost/ caught only half
        // of it, and the half it missed failed silently.
        { re: /An enemy fleet (?:lost|did not come out)/i, event: 'enemySighted' }
    ];

    function observe(message) {
        if (typeof message !== 'string') return;
        for (const watcher of OBSERVERS) {
            const match = watcher.re.exec(message);
            if (match) {
                const context = {};
                if (watcher.sector && match[watcher.sector]) {
                    context.sector = match[watcher.sector];
                }
                say(watcher.event, context);
                return;
            }
        }
    }

    return { setRace, say, observe };
})();

if (typeof window !== 'undefined') {
    window.Advisor = Advisor;
}
