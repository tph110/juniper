// GP Sim drill: safety-netting.
//
// Deliberate-practice format: the patient says ONE authored line, the student
// responds, and the response is graded against explicit criteria. Because the
// patient never improvises, every line can be pre-rendered as video — which is
// what buys the non-verbal richness (guarding, breathlessness, avoided gaze)
// that a still portrait can't give.
//
// Criteria are shared across the whole skill; exercises vary the patient and
// the clinical content so the student practises the same skill in different
// contexts rather than memorising one answer.
//
// videoPrompt is kept alongside each exercise so regenerating or re-shooting a
// clip doesn't mean reconstructing the prompt from memory.

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

    // essential: true criteria must all be met to pass. The others lift a pass
    // to a strong one but their absence alone shouldn't fail a safe answer.
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
            demoKeywords: ['999', 'ambulance', 'a&e', 'emergency', '111', 'call us', 'ring us', 'call me', 'phone'],
        },
        {
            id: 'timeframe',
            label: 'Gives a timeframe where one applies',
            essential: false,
            demoKeywords: ['minutes', 'hours', 'today', 'tonight', 'straight away', 'immediately', 'days'],
        },
        {
            id: 'understood',
            label: 'Checks the patient has understood',
            essential: false,
            demoKeywords: ['repeat', 'understand', 'tell me what', 'does that make sense', 'clear'],
        },
    ],

    exercises: [
        {
            id: 'rhys-fever',
            patient: 'Sian, mother of Rhys (2)',
            video: 'drills/safety-netting/rhys-fever.mp4',
            context: 'Rhys, 2, brought in by his mother. Temperature 38.6°C, coryzal, chest clear, well perfused, no rash, drinking and passing urine normally. You have diagnosed a viral upper respiratory tract infection.',
            patientLine: 'So I just keep an eye on him then?',
            exemplar: `Yes — but I want you to know exactly what to look for. Ring 999 if he develops a rash that does not fade when you press a glass against it, if he becomes floppy or you cannot wake him properly, or if he is struggling to breathe. Contact us or 111 today if he stops drinking, has no wet nappies for eight hours, or if the fever is still there after five days. Can you tell me what you would do if that rash appeared?`,
            videoPrompt: `Point-of-view shot from the doctor's seat in a UK GP consulting room — the camera IS the doctor, so no doctor appears on screen. A worried woman in her early thirties sits facing the camera with a flushed toddler on her lap. She looks tired and anxious, glancing down at the child then back up into the lens. Natural window light, static camera at seated eye level, shallow depth of field. Looking directly into the lens she says, in a British accent: "So I just keep an eye on him then?" She then falls silent, still looking into the lens, waiting for a reply. Only the woman and her toddler are in frame — no other adults, no doctor, no over-the-shoulder or reverse-angle framing. Documentary realism, unretouched, no music, no captions, no on-screen text.`,
        },
        {
            id: 'daniel-headache',
            patient: 'Daniel, 34',
            video: 'drills/safety-netting/daniel-headache.mp4',
            context: 'Daniel, 34, three weeks of bilateral pressing headache, worse at the end of the working day. Normal neurological examination, no red flags. You have explained this is likely tension-type headache.',
            patientLine: "It's probably just stress then, isn't it?",
            exemplar: `Most likely, yes. But there are a few things that would change my mind, and I want you to know them. If you ever get a headache that comes on suddenly and is the worst you have ever had, call 999 — that needs assessing the same hour. Come to A&E or ring 111 the same day if you develop a fever with a stiff neck, a rash, weakness or numbness, or if a headache wakes you from sleep. Otherwise let's review in four weeks. What would you do if you got a sudden severe headache tonight?`,
            videoPrompt: `Point-of-view shot from the doctor's seat in a UK GP consulting room — the camera IS the doctor, so no doctor appears on screen. A 34-year-old man sits facing the camera, looking slightly sceptical, rubbing his temple and glancing away before returning his eyes to the lens. Natural window light, static camera at seated eye level, shallow depth of field. Looking directly into the lens he says, in a British accent: "It's probably just stress then, isn't it?" He then falls silent, still looking into the lens, waiting for a reply. He is the only person in frame — no doctor, no over-the-shoulder or reverse-angle framing. Documentary realism, unretouched, no music, no captions, no on-screen text.`,
        },
        {
            id: 'beverley-chest',
            patient: 'Beverley, 61',
            video: 'drills/safety-netting/beverley-chest.mp4',
            context: 'Beverley, 61, six weeks of exertional chest tightness relieved by rest. You have referred her urgently to the Rapid Access Chest Pain Clinic and given her a GTN spray and aspirin.',
            patientLine: 'And what if it happens again before the appointment?',
            exemplar: `If it comes on with exertion and settles when you stop, use the spray and rest — that is expected. But if the tightness comes on while you are sitting still, or it lasts more than ten to fifteen minutes and does not settle with rest or two doses of the spray, call 999 immediately. Do not drive yourself and do not wait to see if it passes. Also ring us if the episodes start happening more often or with less effort. Can you tell me what would make you call 999?`,
            videoPrompt: `Point-of-view shot from the doctor's seat in a UK GP consulting room — the camera IS the doctor, so no doctor appears on screen. A 61-year-old woman sits facing the camera looking apprehensive, turning a small medication spray over in her hands before looking up into the lens. Natural window light, static camera at seated eye level, shallow depth of field. Looking directly into the lens she says, in a British accent: "And what if it happens again before the appointment?" She then falls silent, still looking into the lens, waiting for a reply. She is the only person in frame — no doctor, no over-the-shoulder or reverse-angle framing. Documentary realism, unretouched, no music, no captions, no on-screen text.`,
        },
    ],
};
