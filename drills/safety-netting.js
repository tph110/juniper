// GP Sim drill: safety-netting.
//
// Deliberate-practice format: the patient speaks an authored line, the student
// responds, the patient pushes back with a second authored line, the student
// responds again. Two turns rather than one because a single exchange lets a
// trainee recite a safety-net without ever being asked to make it concrete —
// the pushback is where the learning is.
//
// The patient's lines are fixed regardless of what the student says, so every
// clip can still be pre-rendered. That's what affords the non-verbal detail a
// still portrait can't show.
//
// Each turn may narrow the criteria it is marked against via criteriaIds:
// the second turn of an exercise usually tests one specific thing, and marking
// it against the full list would fail good answers for omitting content the
// patient didn't ask for.

export const skill = {
    id: 'safety-netting',
    title: 'Safety-netting',
    domain: 'clinical-management',
    blurb: 'Telling a patient exactly what should make them seek help, and when.',

    teaching: `Safety-netting is the part of the consultation that protects the patient when your working diagnosis is wrong, or when a benign illness turns serious.

Vague advice — "come back if it gets worse" — is not safety-netting. The patient cannot act on it, and it does not protect them. Effective safety-netting is specific enough that the patient could repeat it back to you:

• name the particular symptoms that should prompt action
• say exactly what to do, and how urgently
• give a timeframe where one applies
• check they have understood, rather than assuming`,

    criteria: [
        {
            id: 'symptoms',
            label: 'Names the specific symptoms that should prompt action',
            essential: true,
            // Deliberately excludes "worse" — "come back if it gets worse" is
            // the vague non-answer this drill exists to correct.
            demoKeywords: ['rash', 'drowsy', 'floppy', 'breathing', 'at rest', 'neck', 'wake', 'vomit', 'minutes', 'drinking', 'nappies'],
        },
        {
            id: 'action',
            label: 'States exactly what to do, and how urgently',
            essential: true,
            demoKeywords: ['999', 'ambulance', 'a&e', 'emergency', '111', 'call us', 'ring us', 'call me', 'phone', 'call anyway'],
        },
        {
            id: 'timeframe',
            label: 'Gives a timeframe where one applies',
            essential: false,
            demoKeywords: ['minutes', 'hours', 'today', 'tonight', 'straight away', 'immediately', 'days', 'weeks'],
        },
        {
            id: 'understood',
            label: 'Checks the patient has understood',
            essential: false,
            demoKeywords: ['repeat', 'understand', 'tell me what', 'does that make sense', 'clear', 'happy with'],
        },
    ],

    exercises: [
        {
            id: 'rhys-fever',
            patient: 'Sian, mother of Rhys (2)',
            context: 'Rhys, 2, brought in by his mother. Temperature 38.6°C, coryzal, chest clear, well perfused, no rash, drinking and passing urine normally. You have diagnosed a viral upper respiratory tract infection.',
            turns: [
                {
                    id: 't1',
                    video: 'drills/safety-netting/rhys-fever-1.mp4',
                    line: 'Thanks for checking him out. So I just keep an eye on him then?',
                    exemplar: `Yes — but I want you to know exactly what to look for. Ring 999 if he develops a rash that does not fade when you press a glass against it, if he becomes floppy or you cannot wake him properly, or if he is struggling to breathe. Contact us or 111 today if he stops drinking, has no wet nappies for eight hours, or if the fever is still there after five days. Can you tell me what you would do if that rash appeared?`,
                    // Framed on the parent alone: video models refuse to generate
                    // children, and the safety-netting conversation is with her
                    // anyway. The child exists only in the written context.
                    videoPrompt: `Point-of-view shot from the doctor's seat in a UK GP consulting room — the camera IS the doctor, so no doctor appears on screen. Head-and-shoulders framing of a woman in her early thirties sitting facing the camera, looking tired and anxious. Natural window light, static camera at seated eye level, shallow depth of field.

She looks into the lens and speaks one single line of dialogue, exactly once, in a British accent: "Thanks for checking him out. So I just keep an eye on him then?"

After the final word she says nothing more. She waits in silence for the remainder of the shot, glancing down at her hands and twisting her ring before looking back into the lens. No repeated dialogue, no looped speech, no second delivery of the line.

She is the only person in frame. No children, no other adults, no doctor, no over-the-shoulder or reverse-angle framing. Documentary realism, unretouched, no music, no captions, no on-screen text.`,
                },
                {
                    id: 't2',
                    // Tests whether the trainee gives a default route when the
                    // patient is uncertain — the commonest reason parents delay.
                    criteriaIds: ['action', 'understood'],
                    video: 'drills/safety-netting/rhys-fever-2.mp4',
                    line: "And if I'm not sure whether it's bad enough to call? I don't want to waste anybody's time.",
                    exemplar: `Then please call anyway. If you are worried, that is reason enough — you will not be wasting anybody's time with a two-year-old. Ring us during the day, 111 in the evening or at the weekend, and 999 if he is struggling to breathe or you cannot wake him. Is that clear enough for you to act on tonight?`,
                    videoPrompt: `Point-of-view shot from the doctor's seat in a UK GP consulting room — the camera IS the doctor, so no doctor appears on screen. Head-and-shoulders framing of the same woman in her early thirties sitting facing the camera, looking slightly embarrassed and apologetic. Natural window light, static camera at seated eye level, shallow depth of field.

She looks into the lens and speaks one single line of dialogue, exactly once, in a British accent: "And if I'm not sure whether it's bad enough to call? I don't want to waste anybody's time."

After the final word she says nothing more. She waits in silence for the remainder of the shot, pulling her cardigan sleeve over her wrist and giving a small apologetic shrug before looking back into the lens. No repeated dialogue, no looped speech, no second delivery of the line.

She is the only person in frame. No children, no other adults, no doctor, no over-the-shoulder or reverse-angle framing. Documentary realism, unretouched, no music, no captions, no on-screen text.`,
                },
            ],
        },
        {
            id: 'daniel-headache',
            patient: 'Daniel, 34',
            context: 'Daniel, 34, three weeks of bilateral pressing headache, worse at the end of the working day. Normal neurological examination, no red flags. You have explained this is likely tension-type headache.',
            turns: [
                {
                    id: 't1',
                    video: 'drills/safety-netting/daniel-headache-1.mp4',
                    line: "It's probably just stress then, isn't it?",
                    exemplar: `Most likely, yes. But there are a few things that would change my mind, and I want you to know them. If you ever get a headache that comes on suddenly and is the worst you have ever had, call 999 — that needs assessing the same hour. Come to A&E or ring 111 the same day if you develop a fever with a stiff neck, a rash, weakness or numbness, or if a headache wakes you from sleep.`,
                    videoPrompt: `Point-of-view shot from the doctor's seat in a UK GP consulting room — the camera IS the doctor, so no doctor appears on screen. A 34-year-old man sits facing the camera, looking slightly sceptical. Natural window light, static camera at seated eye level, shallow depth of field.

He looks into the lens and speaks one single line of dialogue, exactly once, in a British accent: "It's probably just stress then, isn't it?"

After the final word he says nothing more. He waits in silence for the remainder of the shot, rubbing his temple once and glancing away before returning his eyes to the lens. No repeated dialogue, no looped speech, no second delivery of the line.

He is the only person in frame — no doctor, no over-the-shoulder or reverse-angle framing. Documentary realism, unretouched, no music, no captions, no on-screen text.`,
                },
                {
                    id: 't2',
                    // Tests the review interval AND that urgent routes override it.
                    criteriaIds: ['timeframe', 'action'],
                    video: 'drills/safety-netting/daniel-headache-2.mp4',
                    line: 'And how long should I give it before I come back?',
                    exemplar: `Give it four weeks with the changes we have talked about, and book a review then so we can see whether it is settling. But do not wait four weeks if anything changes — same day if you get a fever with a stiff neck or any weakness or numbness, and 999 straight away for a sudden worst-ever headache. Shall I book that review before you go?`,
                    videoPrompt: `Point-of-view shot from the doctor's seat in a UK GP consulting room — the camera IS the doctor, so no doctor appears on screen. A 34-year-old man sits facing the camera, more engaged now, leaning slightly forward with his hands on his knees. Natural window light, static camera at seated eye level, shallow depth of field.

He looks into the lens and speaks one single line of dialogue, exactly once, in a British accent: "And how long should I give it before I come back?"

After the final word he says nothing more. He waits in silence for the remainder of the shot, leaning back slightly in the chair and holding the camera's gaze. No repeated dialogue, no looped speech, no second delivery of the line.

He is the only person in frame — no doctor, no over-the-shoulder or reverse-angle framing. Documentary realism, unretouched, no music, no captions, no on-screen text.`,
                },
            ],
        },
        {
            id: 'beverley-chest',
            patient: 'Beverley, 61',
            context: 'Beverley, 61, six weeks of exertional chest tightness relieved by rest. You have referred her urgently to the Rapid Access Chest Pain Clinic and given her a GTN spray and aspirin.',
            turns: [
                {
                    id: 't1',
                    video: 'drills/safety-netting/beverley-chest-1.mp4',
                    line: 'And what if it happens again before the appointment?',
                    exemplar: `If it comes on with exertion and settles when you stop, use the spray and rest — that is expected. But if the tightness comes on while you are sitting still, or it lasts more than ten to fifteen minutes and does not settle with rest, call 999 immediately. Do not drive yourself and do not wait to see if it passes.`,
                    videoPrompt: `Point-of-view shot from the doctor's seat in a UK GP consulting room — the camera IS the doctor, so no doctor appears on screen. A 61-year-old woman sits facing the camera looking apprehensive, a small medication spray in her hands. Natural window light, static camera at seated eye level, shallow depth of field.

She looks into the lens and speaks one single line of dialogue, exactly once, in a British accent: "And what if it happens again before the appointment?"

After the final word she says nothing more. She waits in silence for the remainder of the shot, turning the spray over in her hands and glancing down at it before looking back into the lens. No repeated dialogue, no looped speech, no second delivery of the line.

She is the only person in frame — no doctor, no over-the-shoulder or reverse-angle framing. Documentary realism, unretouched, no music, no captions, no on-screen text.`,
                },
                {
                    id: 't2',
                    // The GTN protocol: the specific threshold that turns a
                    // routine episode into a 999 call.
                    criteriaIds: ['symptoms', 'action', 'timeframe'],
                    video: 'drills/safety-netting/beverley-chest-2.mp4',
                    line: "And if I use the spray and it doesn't help?",
                    exemplar: `Sit down, and take a second dose after five minutes. If the tightness is still there five minutes after that second dose — so around fifteen minutes in total — call 999 straight away, even if it has started to ease. Do not drive yourself to hospital and do not wait for someone to come home.`,
                    videoPrompt: `Point-of-view shot from the doctor's seat in a UK GP consulting room — the camera IS the doctor, so no doctor appears on screen. A 61-year-old woman sits facing the camera holding a small medication spray, her expression more worried than before. Natural window light, static camera at seated eye level, shallow depth of field.

She looks into the lens and speaks one single line of dialogue, exactly once, in a British accent: "And if I use the spray and it doesn't help?"

After the final word she says nothing more. She waits in silence for the remainder of the shot, gripping the spray a little tighter and holding the camera's gaze. No repeated dialogue, no looped speech, no second delivery of the line.

She is the only person in frame — no doctor, no over-the-shoulder or reverse-angle framing. Documentary realism, unretouched, no music, no captions, no on-screen text.`,
                },
            ],
        },
    ],
};

// Criteria a given turn is marked against — the whole list unless the turn
// narrows it.
export function criteriaForTurn(turn) {
    if (!turn?.criteriaIds) return skill.criteria;
    return skill.criteria.filter((c) => turn.criteriaIds.includes(c.id));
}
