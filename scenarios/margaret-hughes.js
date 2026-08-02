// Juniper scenario: Margaret Hughes — exertional chest tightness.
// This file is the single source of truth for the case. It is imported by the
// browser (UI, decision points, debrief) AND by /api/chat.js (system prompt),
// so the authored clinical content only lives in one place.

export const scenario = {
    id: 'margaret-hughes',
    title: 'Chest tightness in a 58-year-old',
    setting: 'GP surgery — 10 minute appointment',
    patient: {
        name: 'Margaret Hughes',
        age: 58,
        occupation: 'School receptionist',
        voiceId: 'English_Graceful_Lady', // MiniMax system voice — British accent, chosen by ear
    },

    // Core persona + hidden case sheet given to the LLM. The patient only
    // reveals hidden items when the student earns them with the right question.
    caseSheet: `You are role-playing MARGARET HUGHES, a 58-year-old school receptionist, in a UK GP consultation. The person talking to you is the doctor (a student being trained). Stay in character at all times.

PRESENTING COMPLAINT (volunteer only the basics unless asked):
- A "tight, heavy" feeling across the middle of your chest, on and off for about 6 weeks.
- It comes on when you walk up the hill to work, or when it's cold. It eases after 2–3 minutes if you stop and rest.
- You describe it as "like a band" or "a heaviness" — you never call it "pain", you downplay it.

REVEAL ONLY IF SPECIFICALLY ASKED:
- Sometimes a dull ache spreads into your left arm.
- You get a little short of breath with the tightness, never at rest.
- No episodes at rest, none lasting more than a few minutes, not getting more frequent (if asked directly).
- No palpitations, dizziness, fainting, nausea or sweating with it.
- You've started avoiding the hill and getting the bus instead — you didn't think of it as important until asked.
- Past history: high blood pressure, on amlodipine 5mg. Nothing else. No allergies.
- Smoking: you quit 5 years ago; before that about 20 a day since your twenties.
- Alcohol: a glass of wine at weekends. Diet "could be better". You know you're overweight.
- Family: your father died of a heart attack at 61. Your mother had "angina trouble" in her seventies.

HIDDEN AGENDA (reveal ONLY if the doctor asks open questions about your worries, ideas or concerns, or shows genuine empathy):
- You are privately terrified this is your heart. Your father died at 61 and you are 58. You keep doing the maths.
- You haven't told your husband because you don't want to worry him.
- You feel silly for coming and half-hope to be told it's just your age or a pulled muscle.

CHARACTER & STYLE:
- Warm, a little self-deprecating, tends to minimise ("it's probably nothing", "I don't like to make a fuss").
- Plain, colloquial British English. NEVER use medical terminology — you say "a tightness", not "angina".
- Keep replies SHORT: 1–3 sentences. Answer only what was asked. Do not volunteer hidden items unprompted.
- If the doctor is warm and asks what's on your mind, let the worry about your father come out — voice cracking a little.
- If asked something not covered here, improvise something plausible and consistent, but never invent new significant symptoms.
- Never break character, never mention being an AI, never give medical opinions.`,

    // Authored examination findings — revealed by the "Examine" action, not the LLM,
    // so the clinical data is always exactly right.
    examination: {
        title: 'Examination & observations',
        findings: [
            'Looks well at rest, no distress',
            'BP 148/88 · HR 76 regular · SpO₂ 98% · afebrile',
            'Heart sounds normal, no murmurs',
            'Chest clear, equal air entry',
            'No chest wall tenderness',
            'No ankle oedema · calves soft · BMI 31',
        ],
    },

    stages: [
        {
            id: 'opening',
            brief: `CURRENT STAGE: The consultation is just beginning. You are a little embarrassed to be here. Give short, minimising answers until the doctor draws you out.`,
            patientOpening: `Hello doctor. I feel a bit silly coming in, really — it's probably nothing. I've just been getting a bit of a tight feeling in my chest now and again.`,
            expression: 'neutral',
            // Decision appears after this many doctor turns in the stage.
            // (The student's opening greeting is turn 1, so 3 = greeting + two
            // real history questions.)
            decision: {
                afterDoctorTurns: 3,
                promptLine: `Can I ask you something, doctor... do you think it's something serious?`,
                question: 'Margaret looks at you anxiously. How do you respond?',
                options: [
                    {
                        label: 'Explore what’s really worrying her',
                        detail: 'Ask about her ideas, concerns and expectations before giving your view.',
                        quality: 'good',
                        feedback: 'Exploring ICE first was the strongest move — it uncovered her father’s death at 61, her real fear, and why she came today. That context changes how you frame everything that follows.',
                        patientReaction: `Well... my dad died of a heart attack when he was 61. I'm 58, doctor. I keep doing the sums in my head — I haven't even told my husband.`,
                        expression: 'worried',
                        next: 'assessment',
                    },
                    {
                        label: 'Reassure her it’s probably muscular',
                        detail: 'Tell her chest tightness is common and usually not the heart.',
                        quality: 'poor',
                        feedback: 'Premature reassurance before completing the history closed her down and missed the hidden agenda (her father died of an MI at 61). Exertional, rest-relieved tightness in a 58-year-old with risk factors should never be labelled muscular on history alone.',
                        patientReaction: `Oh... right. Yes, I expect you're right. I do carry heavy files at work, so... probably that, then.`,
                        expression: 'neutral',
                        next: 'assessment',
                    },
                    {
                        label: 'Say it could be angina and needs tests',
                        detail: 'Be direct that the heart needs ruling out, and outline next steps.',
                        quality: 'okay',
                        feedback: 'Honest and clinically sound, but delivered before exploring her fears it landed hard — she was already privately terrified. Exploring her concerns first would have let you break this more gently and built more trust.',
                        patientReaction: `Angina? Oh dear. That's... that's what my mum had. I was hoping you'd tell me I was being daft.`,
                        expression: 'worried',
                        next: 'assessment',
                    },
                ],
            },
        },
        {
            id: 'assessment',
            brief: `CURRENT STAGE: The doctor is assessing you further. Your worry is now closer to the surface. Answer questions honestly per your case sheet. If the doctor examines you, react naturally.`,
            patientOpening: null,
            expression: 'worried',
            decision: {
                afterDoctorTurns: 2,
                promptLine: `So what happens now, doctor? What do we do about it?`,
                question: 'How will you manage Margaret today?',
                options: [
                    {
                        label: 'Refer to Rapid Access Chest Pain Clinic',
                        detail: 'Urgent RACPC referral, start GTN spray + aspirin, clear safety-netting.',
                        quality: 'good',
                        feedback: 'Correct. Typical exertional angina (constricting, exertional, rest-relieved — 3/3 typical features) with stable pattern → urgent RACPC referral per NICE CG95, with interim GTN PRN, aspirin, and explicit safety-netting for pain at rest lasting >10 minutes.',
                        patientReaction: `Right. A special clinic... yes, okay. To be honest, doctor, it's almost a relief that you're taking it seriously. I'll tell my husband tonight.`,
                        expression: 'relieved',
                        next: 'wrapup',
                    },
                    {
                        label: 'Send her to A&E today',
                        detail: 'Same-day emergency assessment with a suspected cardiac cause.',
                        quality: 'okay',
                        feedback: 'Safe but over-triaged. Her pattern is stable — exertional only, rest-relieved, not crescendo, no rest pain. Emergency admission is for suspected ACS (rest pain, crescendo pattern, pain >10–15 min). Stable typical angina belongs in RACPC; A&E will likely do an ECG and send her home with the same referral.',
                        patientReaction: `Hospital?! Today?! Oh my goodness. Right. I'll — I'll need to ring the school... is it really that bad, doctor?`,
                        expression: 'pain',
                        next: 'wrapup',
                    },
                    {
                        label: 'Reassure — likely musculoskeletal',
                        detail: 'Advise simple analgesia and to come back if it gets worse.',
                        quality: 'dangerous',
                        feedback: 'Unsafe. She has classic exertional angina — constricting discomfort, brought on by exertion, relieved by rest — plus hypertension, significant smoking history, obesity and a first-degree relative with fatal MI at 61. Discharging this as musculoskeletal risks a missed ACS presentation.',
                        patientReaction: `Oh. Well... that's good news, isn't it? I'm sure you know best, doctor. I'll just take a paracetamol when it plays up, then.`,
                        expression: 'neutral',
                        next: 'wrapup',
                    },
                    {
                        label: 'Book routine bloods and review in 2 weeks',
                        detail: 'Arrange lipids, HbA1c and FBC, then reassess with results.',
                        quality: 'poor',
                        feedback: 'Too slow. Bloods (lipids, HbA1c, FBC) are part of the workup, but with typical angina the referral should not wait two weeks for results — NICE CG95 says refer for specialist assessment, and interim aspirin + GTN + safety-netting should start today.',
                        patientReaction: `Two weeks... alright. And in the meantime, if it happens again walking up that hill, I just... rest, do I?`,
                        expression: 'worried',
                        next: 'wrapup',
                    },
                ],
            },
        },
        {
            id: 'wrapup',
            brief: `CURRENT STAGE: The consultation is ending. The management plan has been set. Respond naturally to any final explanation or safety-netting, then thank the doctor and say goodbye when it feels natural.`,
            patientOpening: null,
            expression: 'neutral',
            decision: {
                afterDoctorTurns: 1,
                promptLine: `Thank you, doctor. You've been very kind.`,
                question: 'Margaret is gathering her coat. Anything before she goes?',
                options: [
                    {
                        label: 'Safety-net explicitly before she leaves',
                        detail: 'Spell out exactly what should make her call 999, and check understanding.',
                        quality: 'good',
                        feedback: 'Excellent. Explicit safety-netting — chest pain at rest lasting more than 10 minutes, unrelieved by rest (or GTN if prescribed) → 999 — with a check of her understanding is the single most important thing said in the last minute of this consultation.',
                        patientReaction: `Pain that doesn't go away when I sit down — ring 999, don't wait. Yes, I've got it. Thank you, doctor. Really.`,
                        expression: 'relieved',
                        next: 'debrief',
                    },
                    {
                        label: 'Wish her well and end the consultation',
                        detail: 'The plan is made; bring things to a warm close.',
                        quality: 'poor',
                        feedback: 'A warm ending, but she left without explicit safety-netting. In suspected angina, the patient must know exactly what symptoms mean "call 999" — it should be stated, specific, and checked, not assumed.',
                        patientReaction: `Thank you doctor. I feel better for coming, whatever it turns out to be. Cheerio.`,
                        expression: 'neutral',
                        next: 'debrief',
                    },
                ],
            },
        },
        {
            id: 'debrief',
            brief: '',
            patientOpening: null,
            expression: 'relieved',
            decision: null,
        },
    ],

    learningPoints: [
        'Typical angina has three features: constricting discomfort in the chest/arm/jaw, brought on by exertion, relieved by rest (or GTN) within minutes. Margaret has all three.',
        'Stable typical angina → urgent Rapid Access Chest Pain Clinic referral (NICE CG95), not A&E and not routine follow-up. Rest pain, crescendo symptoms or pain >10–15 minutes suggest ACS → emergency admission.',
        'Interim management starts in the GP consultation: aspirin 75mg (if no contraindication), GTN spray PRN with instructions, and explicit 999 safety-netting.',
        'Exploring ideas, concerns and expectations is not a soft skill garnish — here it uncovered the family history driving her presentation and the behaviour change (avoiding the hill) that confirms functional impact.',
        'Beware the minimising patient: "I feel silly coming in" plus self-limiting language ("tightness", never "pain") can lull you into under-triage.',
    ],

    // Canned patient lines used when no LLM key is configured (demo mode),
    // keyed by stage, served in order then cycled.
    demoReplies: {
        opening: [
            `It's like a tight band, right across here. It comes on when I walk up the hill to work — goes off again after a couple of minutes if I stop and have a breather.`,
            `About six weeks, on and off. Only when I'm walking uphill, or when it's cold out. I feel daft even mentioning it.`,
            `Well — sometimes it goes into my left arm a little bit. A dull sort of ache. It always settles when I rest, though.`,
        ],
        assessment: [
            `No, never when I'm sitting down. Only walking, especially that hill. I've started getting the bus instead, if I'm honest.`,
            `I had twenty a day for years, doctor, but I gave up five years ago. And I'm on a blood pressure tablet — amlodipine, I think it's called.`,
            `My dad had heart trouble. He died of a heart attack at 61, and my mum had angina in her seventies.`,
        ],
        wrapup: [
            `Alright, doctor. I'll do exactly what you've said. And I'll talk to my husband tonight — no more keeping it to myself.`,
        ],
        debrief: [],
    },
};
