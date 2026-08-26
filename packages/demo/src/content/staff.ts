import type { DemoThread } from './types'

export const STAFF_THREADS: readonly DemoThread[] = [
  {
    forum: 'committee',
    author: 'admin',
    title: 'What goes in here and what does not',
    daysAgo: 320,
    sticky: true,
    locked: true,
    message: [
      'This whole section is invisible to everybody outside the three staff groups. That is a permissions setting on the category, inherited by the forums under it, and any administrator can read it off the permissions screen — there is no secret system and nothing here is hidden from the people who are supposed to see it.',
      '',
      '**In here:** anything about an individual member, safeguarding, money before it is decided, and drafts.',
      '',
      '**Not in here:** anything that could go on the open board. If a decision is made in this section, the decision goes out there with a reason attached. A committee that decides in private and announces without reasons is how a club loses people.',
      '',
      'Assume everything you write here will be read out at some point. It is private, not deniable.',
    ].join('\n'),
  },
  {
    forum: 'committee',
    author: 'siobhan',
    title: 'Fees: modelling three options before we say anything out loud',
    daysAgo: 210,
    message: [
      'Nothing is decided and nothing goes to the club until it is. Three options, with what each one does to the year:',
      '',
      '1. **Hold everything.** We are €2,100 short by August and the shortfall comes out of the pitch fund, which means the drainage slips another year.',
      '2. **Adult playing up €15, everything else held.** Covers it, and it falls entirely on the people who already pay the most.',
      '3. **Everything up 8%, family rate introduced.** Covers it with €400 spare, costs the households with three children less than they pay now, and costs a single adult social member €2.',
      '',
      'I am for the third one. I want to be argued with before I am for it in public.',
    ].join('\n'),
    replies: [
      {
        author: 'admin',
        hoursAfter: 5,
        message:
          'Third, and say the €2 out loud. Every fee rise in this club has been fought over a number nobody was ever told.',
      },
      {
        author: 'dara',
        hoursAfter: 11,
        message:
          'Third. The second one punishes the people who turn up, and they are the people we cannot afford to annoy.',
      },
      {
        author: 'mairead',
        hoursAfter: 20,
        message:
          'Third, with the family rate uncapped. Four households have more than two playing. Capping it saves us about €200 and looks mean for €200.',
      },
      {
        author: 'kev',
        hoursAfter: 26,
        message:
          'One thing: whatever we pick, put the "nobody is ever turned away for not being able to pay" line in the same post. Not a footnote three weeks later.',
      },
      {
        author: 'siobhan',
        hoursAfter: 44,
        quotes: 4,
        message:
          'Agreed, and it should have been in the draft. Going to the AGM as option three, uncapped, with that line in bold.',
      },
      {
        author: 'vex',
        hoursAfter: 70,
        message:
          'For the record the gaming side pays the adult social rate and nobody has ever queried it. An 8% rise on €25 is not going to start now.',
      },
    ],
  },
  {
    forum: 'committee',
    author: 'siobhan',
    title: 'A sponsorship approach from a betting company',
    daysAgo: 130,
    message: [
      'They have offered €6,000 a year for three years for the shirt front. That is more than every other sponsor we have put together.',
      '',
      'My answer is no. I want it minuted as a committee decision rather than as mine, and I want the reason written down for whoever is sitting here in five years when the offer comes again.',
      '',
      'The reason: we have a juvenile section of two hundred children and their jerseys would carry it too.',
    ].join('\n'),
    replies: [
      {
        author: 'mairead',
        hoursAfter: 2,
        message: 'No, and thank you for making it a decision rather than a conversation.',
      },
      {
        author: 'admin',
        hoursAfter: 6,
        message:
          'No. And worth saying: €6,000 is two years of drainage. It is a real cost and we should be honest that we are choosing to pay it.',
      },
      {
        author: 'dara',
        hoursAfter: 9,
        message:
          'No from me. I would also like us to write the policy now, in one sentence, so the next one is answered in a day rather than a fortnight.',
      },
      {
        author: 'vex',
        hoursAfter: 14,
        message:
          'No. It would land particularly badly on our side, where half the audience is under twenty-five and the ads are already everywhere.',
      },
      {
        author: 'kev',
        hoursAfter: 26,
        message:
          'Unanimous then. Sentence for the policy: "No sponsorship from gambling, alcohol brands aimed at under-25s, or anything that would appear on a juvenile jersey."',
      },
      {
        author: 'siobhan',
        hoursAfter: 50,
        quotes: 5,
        message:
          'That is the policy, minuted, and it goes in the open moderation forum so members can see what we said no to.',
      },
    ],
  },
  {
    forum: 'committee',
    author: 'admin',
    title: 'The facilities grant, and the five-year condition attached to it',
    daysAgo: 95,
    message: [
      'The grant would cover €7,000 of the €14,000 drainage job. The condition is that the pitch stays available to community use for five years, minimum twenty hours a week, with a reporting form every quarter.',
      '',
      'We already do more than twenty hours. The question is whether we want to be signed up to doing it, and whether anybody here fancies the form.',
    ].join('\n'),
    replies: [
      {
        author: 'siobhan',
        hoursAfter: 4,
        message:
          'We do about thirty-five hours as it stands. The risk is not the hours, it is a bad winter where the pitch is shut for six weeks and we are technically in breach.',
      },
      {
        author: 'dara',
        hoursAfter: 8,
        message:
          'Ring them and ask how closures are treated. I would put money on there being a standard answer they give twenty clubs a year.',
      },
      {
        author: 'admin',
        hoursAfter: 30,
        message:
          'Rang them. Closures for weather do not count against you, they want it noted on the quarterly form and that is all.',
      },
      {
        author: 'kev',
        hoursAfter: 44,
        message: 'Then it is four forms a year for seven thousand euro. I will do the forms.',
      },
      {
        author: 'mairead',
        hoursAfter: 50,
        message:
          'Kev has now volunteered for two things in one week and I would like somebody to check on him.',
      },
      {
        author: 'siobhan',
        hoursAfter: 74,
        message:
          'Applying. Tomás and Noelle have the financial section done and Rosa has been through it — she has written eleven of these.',
      },
    ],
  },
  {
    forum: 'committee',
    author: 'vex',
    title: 'The gaming section and the constitution: two paragraphs',
    daysAgo: 70,
    message: [
      'Draft wording, which I would rather be corrected on now than on the night.',
      '',
      "The short of it: same membership, same subs, no separate committee, one officer at the table, and the under-18 rules are the club's rather than ours. We are a section, the same way the juveniles are a section.",
      '',
      'What I have deliberately not asked for: our own budget. The moment we have one we are a second club and I have watched that go wrong somewhere else.',
    ].join('\n'),
    replies: [
      {
        author: 'siobhan',
        hoursAfter: 6,
        message:
          'The no-budget line is the one that will get this through without a row, and you are right about why.',
      },
      {
        author: 'admin',
        hoursAfter: 11,
        message:
          'One change: "the section officer is elected by the section" rather than appointed by you. Not because anybody minds you, because in four years it will not be you.',
      },
      { author: 'vex', hoursAfter: 14, quotes: 2, message: 'Fair and better. Changed.' },
      {
        author: 'mairead',
        hoursAfter: 26,
        message:
          'Add a line that the welfare officer covers the section the same as the pitch. It is already true in practice and it should be true on paper.',
      },
      {
        author: 'dara',
        hoursAfter: 30,
        message:
          'Fifty-one members and a line in the constitution. Two years ago it was five lads who could not be bothered going home after training.',
      },
      {
        author: 'siobhan',
        hoursAfter: 74,
        message: 'Going to the AGM as drafted. Vex is speaking to it, not me.',
      },
    ],
  },
  {
    forum: 'committee',
    author: 'admin',
    title: 'Insurance renewal is up 22% and I know why',
    daysAgo: 55,
    message: [
      'Renewal came in at €4,180 against €3,420 last year. The broker has rated the gaming section as a new activity with no claims history.',
      '',
      'It comes down next year on its own once there is a history. I have asked whether declaring it as a social section rather than an activity changes it, which I suspect is the honest description anyway.',
    ].join('\n'),
    replies: [
      {
        author: 'vex',
        hoursAfter: 3,
        message:
          'Genuinely sorry. If it is going to be a real cost every year we should talk about whether the section carries some of it.',
      },
      {
        author: 'siobhan',
        hoursAfter: 5,
        quotes: 1,
        message:
          'It is not and we will not. Every section costs something and the juveniles cost far more than €760.',
      },
      {
        author: 'admin',
        hoursAfter: 30,
        message:
          'Broker came back: declared as a social activity it is €3,610. Same cover, and it is a more accurate description of eleven people on a headset.',
      },
      {
        author: 'dara',
        hoursAfter: 44,
        message:
          'One phone call for €570. Put that in the AGM notes, it is the kind of thing members never see.',
      },
    ],
  },
  {
    forum: 'committee',
    author: 'siobhan',
    title: 'Drainage: three quotes, and the one I do not trust',
    daysAgo: 40,
    message: [
      'Three back at last.',
      '',
      '- **€14,000** — the one Gerry rates, six weeks, ten-year guarantee, has done two clubs near us that I have rung.',
      '- **€11,500** — no guarantee beyond two years, and the reference I rang was polite in the way people are when they do not want to say it.',
      '- **€19,800** — includes a full resurface we do not need.',
      '',
      'I want the fourteen. It is not the cheapest and I would rather explain that once at the AGM than explain a patched pitch every winter for five years.',
    ].join('\n'),
    replies: [
      {
        author: 'admin',
        hoursAfter: 4,
        message:
          'The €1,900 patch that failed last year is the whole argument for the fourteen. Put both numbers in the same slide.',
      },
      {
        author: 'dara',
        hoursAfter: 9,
        message:
          'Agreed. And can we get the guy who did it to write two paragraphs a member can read? "Ten-year guarantee" means more from him than from us.',
      },
      {
        author: 'kev',
        hoursAfter: 20,
        message:
          'With the grant at seven, the fund at six-two and the quiz money, we are about €800 short. That is one more quiz.',
      },
      {
        author: 'mairead',
        hoursAfter: 26,
        message:
          'The juvenile section will run the one more quiz. Say the word and it is done by March.',
      },
      {
        author: 'siobhan',
        hoursAfter: 44,
        message:
          "Right — fourteen, to the AGM, with the failed patch beside it and Mairéad's quiz as the gap. That is a plan rather than an ask.",
      },
    ],
  },
  {
    forum: 'committee',
    author: 'siobhan',
    title: 'AGM agenda draft — pull it apart before I send it',
    daysAgo: 20,
    message: [
      'Draft is below. I have deliberately put the drainage vote before the constitution changes, because the constitution ones will take an hour and the drainage is the thing people came for.',
      '',
      'Two things I am unsure about: whether to put the treasurer vacancy at the top where it is unavoidable, and whether Vex should speak to the gaming section changes rather than me.',
    ].join('\n'),
    replies: [
      {
        author: 'admin',
        hoursAfter: 4,
        message:
          'Vex should speak to it. It is his section and it will land better from him than from the chair.',
      },
      {
        author: 'vex',
        hoursAfter: 8,
        message:
          'Happy to. I will keep it to three minutes and I will not read the paragraphs out — everybody has them a week early.',
      },
      {
        author: 'dara',
        hoursAfter: 11,
        message: 'Treasurer vacancy at the top. Put it where nobody can leave before it comes up.',
      },
      {
        author: 'kev',
        hoursAfter: 26,
        message:
          'One addition: somebody should say out loud that Noelle is not being pushed. There is a version of this that goes round the village wrongly by Thursday.',
      },
      {
        author: 'siobhan',
        hoursAfter: 30,
        quotes: 4,
        message: 'That is a very good point and it is going in the notice, not just the meeting.',
      },
      {
        author: 'moderator',
        hoursAfter: 50,
        message:
          'Agenda reads well. The only thing missing is a time. People will genuinely not come if they do not know whether it is an hour or three.',
      },
    ],
  },
  {
    forum: 'committee',
    author: 'admin',
    title: 'Treasurer handover: what we tell people the job actually is',
    daysAgo: 12,
    message: [
      'Noelle has written out what she does month by month and the honest total is about four hours in January and twenty minutes in July.',
      '',
      'We have been saying "a couple of hours a week" for six years, which is both wrong and off-putting. I want the notice to say the real numbers.',
      '',
      'The other thing worth saying: since the subs went online, the counting is gone. That was most of the job and it is not part of the job any more.',
    ].join('\n'),
    replies: [
      {
        author: 'siobhan',
        hoursAfter: 3,
        message:
          'Agreed on the real numbers. Nobody has ever taken a volunteer role because the estimate was vague.',
      },
      {
        author: 'dara',
        hoursAfter: 9,
        message:
          'Put both sentences in the notice. "Four hours in January, twenty minutes in July, and the counting is gone" is the whole pitch.',
      },
      {
        author: 'kev',
        hoursAfter: 20,
        message:
          'Two people have asked me quietly about it since the AGM thread went up. They both assumed it was a bookkeeping job and they both do that for a living.',
      },
      {
        author: 'admin',
        hoursAfter: 30,
        quotes: 3,
        message:
          'Then we have two candidates and a wording problem, which is the best kind of problem.',
      },
    ],
  },

  {
    forum: 'staffdesk',
    author: 'moderator',
    title: 'How we work the queue',
    daysAgo: 280,
    sticky: true,
    message: [
      'For anyone new to the staff groups, this is the whole job and it takes about four clicks a day.',
      '',
      '**The approvals queue** holds the first post of every new account. Read it, approve it, and it is on the board. If it is spam, delete the post and the account goes with it. Do it quickly — a new member waiting six hours thinks nobody is here.',
      '',
      '**The reports queue** is anything a member has flagged. Half of it is "probably fine, but look", which is exactly what the button is for. Nothing in there is an accusation against you.',
      '',
      '**Anything about a child** goes to Mairéad, immediately, whatever it is and however small it looks.',
      '',
      'When in doubt, do the reversible thing. Unapproving a post is undoable. A ban that goes round the village is not.',
    ].join('\n'),
    replies: [
      {
        author: 'kev',
        hoursAfter: 9,
        message:
          'The reversible-thing line is the best advice on this board. I have never once regretted waiting an hour.',
      },
      {
        author: 'tinker',
        hoursAfter: 26,
        message:
          'Adding the one from our side: never moderate at 1am after a bad raid. It is never as bad in the morning and I have twice been wrong.',
      },
      {
        author: 'dara',
        hoursAfter: 50,
        message:
          'And if you act on something involving somebody you play with, say so here. Not because it is wrong, because it is better said than found out.',
      },
    ],
  },
  {
    forum: 'staffdesk',
    author: 'tinker',
    title: 'Do we ever ban anybody permanently?',
    daysAgo: 88,
    message: [
      'Genuine question rather than a proposal. We have banned two accounts in two years and both were spam.',
      '',
      'Is there a case where we would ban a real member, and do we know what it is before we are standing in it at eleven at night?',
    ].join('\n'),
    replies: [
      {
        author: 'siobhan',
        hoursAfter: 3,
        message:
          'Yes: anything involving a child, anything that is a threat, and anything that is a pattern after two conversations. The first two are immediate and the third is the committee, not one person.',
      },
      {
        author: 'moderator',
        hoursAfter: 6,
        message:
          'And a ban here is a club matter, not a website matter. Somebody banned from the board is somebody the committee needs to have talked to about the clubhouse.',
      },
      {
        author: 'mairead',
        hoursAfter: 11,
        message:
          'That is the part people miss. This is not a forum with members, it is a club with a forum.',
      },
      {
        author: 'kev',
        hoursAfter: 20,
        message:
          'Worth writing those three lines into the open moderation forum. Members reading "we have banned two accounts and both were spam" is worth more than any policy.',
      },
      {
        author: 'tinker',
        hoursAfter: 44,
        message:
          'That answers it, and I would not have known the answer if I had needed it at eleven at night. Which was the question.',
      },
    ],
  },
  {
    forum: 'staffdesk',
    author: 'dara',
    title: 'Are our warning levels doing anything?',
    daysAgo: 60,
    message: [
      'Six warnings issued in eighteen months. Four were the same person, who left. The other two were both "that was over the line in a match thread" and both people apologised before the warning arrived.',
      '',
      'I am not sure the system is doing the work. I think the conversations are doing the work and the warnings are paperwork on top.',
    ].join('\n'),
    replies: [
      {
        author: 'moderator',
        hoursAfter: 4,
        message:
          'The paperwork matters for the fifth one though. The four-warning member left because there was a record, not because there was a conversation.',
      },
      {
        author: 'siobhan',
        hoursAfter: 9,
        message:
          'Both are true. Keep it, use it rarely, and never issue one instead of a conversation — issue it after.',
      },
      {
        author: 'vex',
        hoursAfter: 20,
        message:
          'The expiry is the bit I would change. Ours never expire and a warning from two years ago should not be sitting on somebody who has been fine since.',
      },
      {
        author: 'admin',
        hoursAfter: 26,
        message:
          'They can expire — it is a setting per warning type. Six months for the mild ones and never for the serious ones is what most boards land on.',
      },
      {
        author: 'dara',
        hoursAfter: 44,
        quotes: 4,
        message:
          'Setting the mild ones to six months. That is a better answer than binning the system.',
      },
    ],
  },
  {
    forum: 'staffdesk',
    author: 'vex',
    title: 'The registration question is too clever and real people are failing it',
    daysAgo: 44,
    message: [
      'Three people this month could not answer "what colour were the away jerseys before the change". Two of them were forty-year members who did not know because they never look at the away jerseys.',
      '',
      'It stops the spam brilliantly and it is stopping about one real person a fortnight. That is a bad trade.',
    ].join('\n'),
    replies: [
      {
        author: 'moderator',
        hoursAfter: 2,
        message:
          'Agreed. Something answerable by anybody who has stood at the pitch once: what is across the road from the clubhouse.',
      },
      {
        author: 'kev',
        hoursAfter: 5,
        message:
          'A shop, a school and a graveyard. Three right answers, which is a different problem.',
      },
      {
        author: 'admin',
        hoursAfter: 9,
        quotes: 2,
        message:
          'It takes any of a list of answers, so three right answers is fine. That is what the field is for.',
      },
      {
        author: 'vex',
        hoursAfter: 20,
        message:
          'Changed, with four accepted answers including one misspelling. Spam is unchanged at under five a day and nobody has failed it since.',
      },
      {
        author: 'tinker',
        hoursAfter: 200,
        message:
          'Six weeks on: no real person has failed it, no spam has got through. Leaving it alone.',
      },
    ],
  },
  {
    forum: 'staffdesk',
    author: 'moderator',
    title: 'Two members had a row in a match thread and both have messaged me',
    daysAgo: 30,
    message: [
      'Both are long-standing, both are decent, both think the other started it, and reading it back they are both about 60% right.',
      '',
      'Nothing in it is bannable. I have taken nothing down. What I would like is a second opinion before I answer either of them, because whatever I say to one will be read by both by Thursday.',
    ].join('\n'),
    replies: [
      {
        author: 'siobhan',
        hoursAfter: 2,
        message:
          'Same message to both, word for word, and tell them it is the same message. It removes the entire "what did he say to you" round.',
      },
      {
        author: 'dara',
        hoursAfter: 5,
        message:
          'And do not adjudicate. "Both of you are fine, that thread was not, leave it there" is the answer that ages best.',
      },
      {
        author: 'mairead',
        hoursAfter: 9,
        message:
          'Would either of them take a phone call rather than a message? Half of these are tone rather than content.',
      },
      {
        author: 'moderator',
        hoursAfter: 26,
        message:
          'Rang both. Ten minutes each. One of them had already sent the other a message before I got to him.',
      },
      {
        author: 'kev',
        hoursAfter: 30,
        message: 'They were both at the quiz on the same team on Friday. Filing that under solved.',
      },
    ],
  },
  {
    forum: 'staffdesk',
    author: 'kev',
    title: 'Somebody is opening six threads a day in the buy and sell',
    daysAgo: 18,
    message: [
      "Breaking no rule, perfectly pleasant, and burying everybody else's posts.",
      '',
      'I know the permission trick — a group with threads off and replies on, applied to that forum. Before I do that quietly to a member, is talking to them first the obvious move I am overthinking?',
    ].join('\n'),
    replies: [
      {
        author: 'moderator',
        hoursAfter: 3,
        message: 'It is the obvious move. Nine times in ten they have no idea and are mortified.',
      },
      {
        author: 'admin',
        hoursAfter: 6,
        message:
          'And keep the permission trick in your back pocket. It is the right tool and it is the wrong first step.',
      },
      {
        author: 'kev',
        hoursAfter: 26,
        message:
          'Talked to them. Mortified, exactly as predicted. One thread now, updated as things sell, and it is a better thread than the six were.',
      },
      {
        author: 'tinker',
        hoursAfter: 44,
        message:
          'Filing "have you tried telling them" under things I have to relearn every six months.',
      },
    ],
  },
  {
    forum: 'staffdesk',
    author: 'kev',
    title: 'A member has asked us to delete their account and everything they wrote',
    daysAgo: 8,
    message: [
      'Left the club in the autumn on decent terms and has asked for the account and all their posts to be removed.',
      '',
      'The account is straightforward. The posts are not — they are in about forty threads including two long ones about the pitch fund, and pulling them leaves holes in conversations other people are quoted in.',
      '',
      'What do we do, and is there a policy? I do not think there is a policy.',
    ].join('\n'),
    replies: [
      {
        author: 'admin',
        hoursAfter: 4,
        message:
          'There is not, and there should be. What the software does: it can delete the account and keep the posts under a placeholder name, or delete both. The first keeps the threads readable, the second is what somebody usually means when they ask.',
      },
      {
        author: 'siobhan',
        hoursAfter: 9,
        message:
          'Ask them which they meant. Most people mean "take my name off it", and when you offer that specifically they take it.',
      },
      {
        author: 'moderator',
        hoursAfter: 20,
        message:
          'And whichever they pick, do it inside a week and tell them when it is done. The waiting is what turns a polite request into a row.',
      },
      {
        author: 'kev',
        hoursAfter: 30,
        message:
          'Asked. They wanted the name off it, not the posts gone. Done this morning and they were grateful.',
      },
      {
        author: 'siobhan',
        hoursAfter: 44,
        message:
          'Writing that up as an actual policy this week, in three sentences, and it goes in the open moderation forum rather than staying in here.',
      },
    ],
  },
  {
    forum: 'staffdesk',
    author: 'moderator',
    title: 'The ticket spam: how do we want to word the reply?',
    daysAgo: 2,
    message: [
      'The reported post in Buy, sell and swap is obvious spam and I will bin it. Two questions before I do.',
      '',
      "First: do we say anything publicly? Petra's thread is a nice thread and it now has a spam reply in the middle of it.",
      '',
      'Second: the member who reported it got no acknowledgement beyond the automatic one, and I keep thinking we should say thanks by hand. Or is that a rod for our own backs?',
    ].join('\n'),
    replies: [
      {
        author: 'kev',
        hoursAfter: 3,
        message:
          'Bin it, no public note. A thread about a deleted spam post is more spam attention than the spam got.',
      },
      {
        author: 'admin',
        hoursAfter: 6,
        message:
          'On the thanks: do it while it is rare. If we are ever getting twenty reports a week we will have bigger problems and can stop then.',
      },
      {
        author: 'siobhan',
        hoursAfter: 9,
        message:
          'Agreed both. And the report form wording could say what happens next, which would do most of the reassuring on its own.',
      },
      {
        author: 'moderator',
        hoursAfter: 20,
        message:
          'Leaving the post up until whoever is on next has seen it, then it goes. It is worth one person seeing what a real one looks like in the queue.',
      },
    ],
  },
  {
    forum: 'staffdesk',
    author: 'moderator',
    title: 'Weekly numbers: queue, reports, new accounts',
    daysAgo: 3,
    message: [
      'Posting these every Sunday so nobody has to guess whether it is getting worse.',
      '',
      '- New accounts: **9**, of which 1 held and approved, 0 spam.',
      '- Posts held for approval: **9**. Longest wait: 4 hours, overnight.',
      '- Reports: **2**, one spam, one "probably fine, take a look".',
      '- Warnings: **0**.',
      '',
      'Nine new accounts in a week is the highest since the season started, and seven of them came from the subs page.',
    ].join('\n'),
    replies: [
      {
        author: 'vex',
        hoursAfter: 4,
        message:
          'Four hours overnight is the one to fix and I have said I will take the overnight approvals. Give me the fortnight and this will read under an hour.',
      },
      {
        author: 'admin',
        hoursAfter: 9,
        message:
          'Seven from the subs page is the number I care about. Paying for something and being asked to make an account in the same minute is working.',
      },
      {
        author: 'dara',
        hoursAfter: 20,
        message:
          'Keep posting these. It took ten minutes to write and it is the only reason anybody knows the queue is fine.',
      },
    ],
  },

  {
    forum: 'welfare',
    author: 'mairead',
    title: 'The rule on photographs, the rule on messages, and who to ring',
    daysAgo: 300,
    sticky: true,
    locked: true,
    message: [
      'Three things, and none of them are up for discussion in here.',
      '',
      '1. **No photograph of a child goes on this board unless their parent has ticked the box on the membership form.** Not "unless they objected". Ticked. Any parent can have any photo removed at any time without giving a reason.',
      '2. **No adult sends a private message to an under-18 through this board.** Not a coach, not an officer, not me. Anything that needs saying goes to the parent or goes in a thread. The board logs private messages and I will read the log if I ever have reason to.',
      '3. **Anything that worries you, ring me the same day.** Not a message, a phone call, and if you cannot get me ring Siobhán. "It is probably nothing" is exactly the thing to ring about.',
      '',
      "My number and Siobhán's are on the noticeboard in the clubhouse and on the welfare page. If you are staff here you should have both in your phone before you read anything else in this section.",
    ].join('\n'),
  },
  {
    forum: 'welfare',
    author: 'siobhan',
    title: 'Vetting backlog is eleven weeks — plan for it',
    daysAgo: 64,
    message: [
      'Eleven weeks at the moment, up from six. That means anybody who might be on a pitch or on a call with under-18s in the spring needs their form in now.',
      '',
      'It also means the summer camp helpers list closes earlier this year than last. I would rather tell somebody in February that they are too late for the camp than tell them in July that they cannot help.',
    ].join('\n'),
    replies: [
      {
        author: 'mairead',
        hoursAfter: 5,
        message:
          'Camp helper forms are going out this week for that reason. Anyone who has helped before is already vetted and does not need to do anything.',
      },
      {
        author: 'vex',
        hoursAfter: 11,
        message: 'Two of ours need it for the Sunday block. Both forms in on Friday.',
      },
      {
        author: 'dara',
        hoursAfter: 26,
        message:
          'Is there anything the club can do to speed it up, or is eleven weeks just eleven weeks?',
      },
      {
        author: 'siobhan',
        hoursAfter: 30,
        quotes: 3,
        message:
          'Eleven weeks is eleven weeks. The only thing that helps is the forms being right first time, and about a third of ours come back for a missing signature.',
      },
      {
        author: 'mairead',
        hoursAfter: 50,
        message:
          'I will check every form before it goes in from now on. Ten minutes each and it saves three weeks each.',
      },
    ],
  },
  {
    forum: 'welfare',
    author: 'vex',
    title: 'Under-16s on the gaming side: what we agreed, and what we actually wrote down',
    daysAgo: 36,
    message: [
      'We have been running the Sunday block with under-16s for four months on rules that live in my head and in a pinned post. That is not good enough and a parent asking about it made me realise how not good enough it is.',
      '',
      'What we do: parental consent on the same form as football, first hour only, two vetted adults on the call at all times, no private messages between adults and under-16s, and the stream cuts anyone who has not opted in.',
      '',
      'What is written down anywhere official: about half of that.',
    ].join('\n'),
    replies: [
      {
        author: 'mairead',
        hoursAfter: 3,
        message:
          'Send it to me and it goes into the club policy word for word. It is the same policy as the pitch, which is the point.',
      },
      {
        author: 'siobhan',
        hoursAfter: 8,
        message:
          "And it goes to the AGM as part of the section wording, so it is the club's rule rather than yours. That protects you as much as anybody.",
      },
      {
        author: 'admin',
        hoursAfter: 14,
        message:
          'The no-private-messages rule can be enforced rather than asked for — the permission is per group, so an under-18 group without private messages is a setting, not a promise.',
      },
      {
        author: 'vex',
        hoursAfter: 20,
        quotes: 3,
        message: 'Do it. I would much rather the software said no than me having to.',
      },
      {
        author: 'mairead',
        hoursAfter: 30,
        message:
          'Policy updated, group created, and the parent who asked has been sent the whole thing. She replied to say it was more than the school gave her.',
      },
    ],
  },
  {
    forum: 'welfare',
    author: 'mairead',
    title: 'A parent has asked about the streaming',
    daysAgo: 21,
    message: [
      'Their child is in the Sunday block and they had not realised it goes out live.',
      '',
      'It does not — the under-18 hour is not streamed at all, which I knew and they did not, and nowhere on the board says so plainly. That is our failure rather than theirs.',
    ].join('\n'),
    replies: [
      {
        author: 'vex',
        hoursAfter: 2,
        message:
          'Correct, the first hour is never streamed. I will put that in the pinned post in bold rather than in the third paragraph.',
      },
      {
        author: 'siobhan',
        hoursAfter: 6,
        message:
          'Put it on the membership form too, beside the photo tick. That is where a parent is actually reading.',
      },
      {
        author: 'mairead',
        hoursAfter: 20,
        message:
          'Both done and the parent is happy. She has since signed the consent for the photos, which she had left blank the first time.',
      },
      {
        author: 'dara',
        hoursAfter: 26,
        message: 'That last sentence is the whole argument for answering these properly.',
      },
    ],
  },
  {
    forum: 'welfare',
    author: 'dara',
    title: 'A parent has asked that their child is not named in the match reports',
    daysAgo: 15,
    message: [
      'No reason given and none asked for. Straightforward to do — I write the reports.',
      '',
      'What I want to check: is it "no name from now on" or should I go back through and take the name out of the eleven reports it is already in? I can do either.',
    ].join('\n'),
    replies: [
      {
        author: 'mairead',
        hoursAfter: 1,
        message:
          'Ask them, and offer the second one before they have to ask for it. Somebody who has had to make this request once does not want to make it twice.',
      },
      {
        author: 'dara',
        hoursAfter: 5,
        message: 'Asked. They want the old ones done too. Editing them this evening.',
      },
      {
        author: 'siobhan',
        hoursAfter: 9,
        message:
          "And nothing said publicly about why. Anyone who notices a name is gone can ask me and I will tell them it is a family's decision and nothing else.",
      },
      {
        author: 'dara',
        hoursAfter: 26,
        message:
          'Eleven reports, took twenty minutes. Going to write the juveniles up by first name only from here on unless a parent has said otherwise — it reads fine and it saves this happening again.',
      },
      {
        author: 'mairead',
        hoursAfter: 30,
        quotes: 4,
        message: 'That should be the club rule and I am putting it in the policy. Well spotted.',
      },
    ],
  },
  {
    forum: 'welfare',
    author: 'mairead',
    title: 'Two safeguarding refreshers are due this month',
    daysAgo: 34,
    message: [
      'Two of the juvenile coaches have training that runs out this month and one has vetting that lapses in March.',
      '',
      'I have messaged all three. Nobody is off the pitch yet, but the rule is the rule and if the refresher has not happened by the end of the month, they are off the pitch.',
      '',
      "Flagging it here so it is nobody's surprise, mine included.",
    ].join('\n'),
    replies: [
      {
        author: 'siobhan',
        hoursAfter: 3,
        message:
          'Correct, and the club pays for all three. If cost is the reason for a delay, that reason is gone.',
      },
      {
        author: 'admin',
        hoursAfter: 9,
        message:
          'Can we put the expiry dates somewhere that shouts before it is urgent? This is the second time it has come up with three weeks to go.',
      },
      {
        author: 'mairead',
        hoursAfter: 20,
        quotes: 2,
        message:
          'I keep them in a spreadsheet and the spreadsheet does not shout. Open to anything better.',
      },
      {
        author: 'dara',
        hoursAfter: 44,
        message:
          'A thread in here per coach with the date in the title, and subscribe to it. Ugly and it would work.',
      },
      {
        author: 'mairead',
        hoursAfter: 200,
        message:
          "All three done with a fortnight to spare. Doing Dara's ugly thing for the next lot.",
      },
    ],
  },

  {
    forum: 'staffroom',
    author: 'siobhan',
    title: 'The thank you thread, which is allowed once a year',
    daysAgo: 200,
    message: [
      'Eight of us keep this place running and none of us are paid, so once a year I am going to be sincere and you can all be uncomfortable about it.',
      '',
      'Between us this year: about two thousand posts read before anybody else saw them, three hundred spam accounts stopped, one very difficult conversation that went well, and one that did not and was still the right call.',
      '',
      'Nobody outside this section knows any of that happened, which is exactly what it looks like when it is done properly.',
    ].join('\n'),
    replies: [
      { author: 'moderator', hoursAfter: 4, message: 'Deeply uncomfortable. Thank you.' },
      {
        author: 'kev',
        hoursAfter: 9,
        message:
          'The one that did not go well still bothers me and I would still do it again, which I think is the job.',
      },
      {
        author: 'tinker',
        hoursAfter: 20,
        message:
          'From three timezones away: this is the only committee I have ever been on where nobody has once said "that is not my job".',
      },
      {
        author: 'mairead',
        hoursAfter: 30,
        message: 'Right, that is enough of that. Back to the rota.',
      },
    ],
  },
  {
    forum: 'staffroom',
    author: 'dara',
    title: 'Who is doing the queue over Christmas?',
    daysAgo: 120,
    message: [
      'The board does not stop between the 23rd and the 2nd — it gets busier, because everybody is at home on a phone.',
      '',
      'I would rather four of us did two days each than one person did the lot and resented us all by January.',
    ].join('\n'),
    replies: [
      {
        author: 'tinker',
        hoursAfter: 3,
        message:
          '24th to the 26th. Christmas is not a thing in my house and the queue is a nice quiet job.',
      },
      { author: 'kev', hoursAfter: 8, message: '27th and 28th.' },
      { author: 'moderator', hoursAfter: 14, message: '29th to the 31st.' },
      { author: 'vex', hoursAfter: 20, message: '1st and 2nd, and I am up at odd hours anyway.' },
      {
        author: 'dara',
        hoursAfter: 30,
        message:
          'Covered in a day, nobody did more than three days, and I did none of it. Excellent work everybody.',
      },
    ],
  },
  {
    forum: 'staffroom',
    author: 'kev',
    title: 'I am going to be off for about six weeks',
    daysAgo: 50,
    message: [
      'Work thing, nothing dramatic, but I will be no use to anybody from the middle of next month.',
      '',
      'Rather than half-doing it, take the noticeboard and the buy-and-sell off me and give them back when I am about. I would rather hand it over than be the reason a report sits for a week.',
    ].join('\n'),
    replies: [
      {
        author: 'moderator',
        hoursAfter: 2,
        message: 'I will take both. They are quiet forums and it is ten minutes a day.',
      },
      {
        author: 'siobhan',
        hoursAfter: 6,
        message:
          'Handed over, and it is handed straight back when you say so. Go and do the work thing.',
      },
      {
        author: 'kev',
        hoursAfter: 200,
        message:
          'Back. Thank you, all of you, and the buy-and-sell is tidier than I left it, which is mildly insulting.',
      },
      { author: 'moderator', hoursAfter: 210, message: 'It is. Take it back.' },
    ],
  },
  {
    forum: 'staffroom',
    author: 'tinker',
    title: 'Does anybody actually notice the staff colours?',
    daysAgo: 33,
    message: [
      'Serious question. We turned the coloured names on months ago — red for the administrators, dark blue for us on the super moderator side, light blue for the moderators.',
      '',
      'Do members notice, and does it change anything about how they read a post?',
    ].join('\n'),
    replies: [
      {
        author: 'moderator',
        hoursAfter: 3,
        message:
          'Yes, and it changed one thing measurably: people stopped asking "who do I ask about this". They just reply to whichever coloured name is in the thread.',
      },
      {
        author: 'mairead',
        hoursAfter: 8,
        message:
          'Parents notice immediately. Half of them cannot tell you what a super moderator is and all of them know a red name means the buck stops there.',
      },
      {
        author: 'kev',
        hoursAfter: 14,
        message:
          'Downside: a coloured name in a thread ends the conversation a bit. I have started deliberately not posting in some threads until it has run.',
      },
      {
        author: 'dara',
        hoursAfter: 20,
        quotes: 3,
        message:
          'That is the real cost of it and it is worth naming. Post as late as you can and let the members answer each other first.',
      },
      {
        author: 'vex',
        hoursAfter: 26,
        message:
          'On our side the colours did more than the titles ever did. Nobody reads a title under a name. Everybody sees a colour.',
      },
    ],
  },
  {
    forum: 'staffroom',
    author: 'mairead',
    title: 'Can we get one more moderator for the juvenile corner?',
    daysAgo: 26,
    message: [
      "Not because it is busy — because it is me, and when I am at a blitz on a Saturday there is nobody watching the threads with two hundred children's parents in them.",
      '',
      'Bernie has offered and I would take her tomorrow. She is vetted through the school, she is in the middle of every juvenile thread anyway, and half the parents ask her things before they ask me.',
    ].join('\n'),
    replies: [
      {
        author: 'siobhan',
        hoursAfter: 5,
        message:
          'No objection at all from me. The only question is whether she knows it is a job rather than a compliment.',
      },
      {
        author: 'moderator',
        hoursAfter: 9,
        message:
          'Sit her down for twenty minutes with the queue first. Everybody says yes and then discovers the reports are the actual work.',
      },
      {
        author: 'kev',
        hoursAfter: 20,
        message: 'Agreed, and she has already been doing the unpaid half for two years.',
      },
      {
        author: 'mairead',
        hoursAfter: 30,
        message:
          'Asking her properly this week, with the twenty minutes and the honest description. If she says yes she gets the juvenile forums and nothing else.',
      },
      {
        author: 'admin',
        hoursAfter: 44,
        message:
          'That is how it should go — appointed to a corner, not handed the whole board. The permissions do that per forum and nobody has to be trusted with more than they asked for.',
      },
    ],
  },
  {
    forum: 'staffroom',
    author: 'dara',
    title: 'Staff cover for the next month',
    daysAgo: 5,
    message: [
      'I am away for two weeks from the 18th and Tinker is on nights, so the queue needs somebody.',
      '',
      'It is about four clicks a day. The only thing that genuinely needs a person is the first-post queue, because a new member waiting six hours for approval is a new member who thinks nobody is here.',
    ].join('\n'),
    replies: [
      {
        author: 'moderator',
        hoursAfter: 2,
        message: 'I will take the queue for the fortnight. I am on it most evenings anyway.',
      },
      {
        author: 'mairead',
        hoursAfter: 6,
        message: 'And I will pick up anything juvenile-related, as usual, whoever is on.',
      },
      {
        author: 'vex',
        hoursAfter: 11,
        message:
          'I am up at odd hours for the roster anyway. Give me the overnight approvals and the queue will never be more than an hour old.',
      },
      {
        author: 'admin',
        hoursAfter: 20,
        quotes: 3,
        message:
          'That is genuinely the best use of a person in a different timezone that anybody has proposed. Done.',
      },
      {
        author: 'dara',
        hoursAfter: 26,
        message:
          'Covered in half a day. Whoever said a committee cannot organise anything has not tried asking for something small and specific.',
      },
    ],
  },
]
