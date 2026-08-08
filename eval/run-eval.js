// Scores the drill grader against hand-marked test cases.
//
//   node dev-server.js          # terminal 1 (with --env-file=.env for real grading)
//   node eval/run-eval.js       # terminal 2
//
// The headline number is FALSE NEGATIVES: responses you marked "pass" that the
// grader marked down. A student told their correct answer was wrong does not
// come back, so that count needs to be zero before this goes near anyone.

import { readFile } from 'node:fs/promises';

const BASE = process.env.EVAL_BASE || 'http://localhost:4620';
const RANK = { miss: 0, partial: 1, pass: 2 };

const { cases } = JSON.parse(
    await readFile(new URL('./responses.json', import.meta.url), 'utf-8'),
);

console.log(`Grading ${cases.length} responses against ${BASE}\n`);

let exact = 0;
let warnedDemo = false;
const falseNegatives = [];
const falsePositives = [];
const errors = [];

for (const [i, c] of cases.entries()) {
    let got;
    try {
        const resp = await fetch(`${BASE}/api/grade`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                skillId: c.skillId,
                exerciseId: c.exerciseId,
                turnId: c.turnId,
                response: c.response,
                priorTurns: c.priorTurns || [],
            }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
        if (data.demo && !warnedDemo) {
            warnedDemo = true;
            console.log('DEMO MODE — no OPENROUTER_API_KEY, so this measures keyword matching, not the grader.\n');
        }
        got = data.verdict;
    } catch (err) {
        errors.push({ i, note: c.note, message: err.message });
        console.log(`${String(i + 1).padStart(2)}. ERROR   ${c.note} — ${err.message}`);
        continue;
    }

    const ok = got === c.expect;
    if (ok) exact++;
    else if (RANK[got] < RANK[c.expect]) falseNegatives.push({ i, note: c.note, expect: c.expect, got });
    else falsePositives.push({ i, note: c.note, expect: c.expect, got });

    const mark = ok ? 'ok     ' : RANK[got] < RANK[c.expect] ? 'HARSH  ' : 'LENIENT';
    console.log(`${String(i + 1).padStart(2)}. ${mark} expected ${c.expect.padEnd(7)} got ${String(got).padEnd(7)} ${c.note}`);
}

const scored = cases.length - errors.length;
console.log('\n' + '─'.repeat(64));
console.log(`Exact agreement : ${exact}/${scored}` + (scored ? ` (${Math.round((exact / scored) * 100)}%)` : ''));
console.log(`False negatives : ${falseNegatives.length}   <- the number that matters`);
console.log(`False positives : ${falsePositives.length}`);
if (errors.length) console.log(`Errors          : ${errors.length}`);

if (falseNegatives.length) {
    console.log('\nGood answers the grader marked down:');
    for (const f of falseNegatives) {
        console.log(`  #${f.i + 1} expected ${f.expect}, got ${f.got} — ${f.note}`);
    }
    console.log('\nFix by loosening the prompt in api/grade.js, not by lowering the bar here.');
}

process.exit(falseNegatives.length ? 1 : 0);
