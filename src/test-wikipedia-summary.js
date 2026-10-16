/**
 * test-wikipedia-summary.js
 *
 * Netwerkloze test voor wikipedia-summary.js#truncateToSentences():
 * inkorten tot een aantal zinnen, met afkortingen, initialen en (0.17.2)
 * Duitse rangtelwoorden ("im 17. Jahrhundert").
 *
 * Uitvoeren vanuit de map `src/` met:
 *   node test-wikipedia-summary.js
 */

const { truncateToSentences } = require('./wikipedia-summary.js');

let geslaagd = 0;
let mislukt = 0;
function check(naam, werkelijk, verwacht) {
  if (werkelijk === verwacht) {
    geslaagd += 1;
    console.log('OK    ' + naam);
  } else {
    mislukt += 1;
    console.log('FOUT  ' + naam);
    console.log('      verwacht:  ' + JSON.stringify(verwacht));
    console.log('      werkelijk: ' + JSON.stringify(werkelijk));
  }
}

const keppel =
  'Schloss Keppel ist ein Schloss in Laag-Keppel. Das Schloss steht auf einer Insel. ' +
  'Auf den Fundamenten wurde das heutige Gebäude (nach der Zerstörung im Jahr 1582) im 17. Jahrhundert errichtet. ' +
  'Heute ist es bewohnt.';
check(
  'Duits rangtelwoord: "im 17. Jahrhundert" breekt niet',
  truncateToSentences(keppel, 3),
  'Schloss Keppel ist ein Schloss in Laag-Keppel. Das Schloss steht auf einer Insel. ' +
    'Auf den Fundamenten wurde das heutige Gebäude (nach der Zerstörung im Jahr 1582) im 17. Jahrhundert errichtet.'
);
check('Datum: "am 3. Mai 1890" breekt niet', truncateToSentences('Er starb am 3. Mai 1890. Danach kam nichts.', 1), 'Er starb am 3. Mai 1890.');
check('Jaartal aan het eind van een zin blijft zinseinde', truncateToSentences('Het kasteel brandde af in 1582. Het werd herbouwd. Nu is het een museum.', 1), 'Het kasteel brandde af in 1582.');
check('Getal van twee cijfers aan het eind van de tekst telt wel', truncateToSentences('De molen heeft wieken. Er wonen 12.', 3), 'De molen heeft wieken. Er wonen 12.');
check('Rangtelwoord tussen haakjes: "(17. Jh.)"', truncateToSentences('Die Kirche (13. Jahrhundert) ist alt. Sie ist schön.', 1), 'Die Kirche (13. Jahrhundert) ist alt.');
check('Nederlands: "17e eeuw" ongewijzigd', truncateToSentences('Het huis is uit de 17e eeuw. Het is mooi. Het staat er nog. Echt.', 3), 'Het huis is uit de 17e eeuw. Het is mooi. Het staat er nog.');
check('Afkorting "ds." blijft werken', truncateToSentences('Ds. Jansen preekte hier. Hij was geliefd.', 1), 'Ds. Jansen preekte hier.');
check('Initialen "J.C." blijven werken', truncateToSentences('Gebouwd door J.C. Kuipers. Later verbouwd.', 1), 'Gebouwd door J.C. Kuipers.');
check('Lege tekst', truncateToSentences('', 3), '');

console.log(
  mislukt === 0 ? `\nAlle ${geslaagd} tests geslaagd.` : `\n${mislukt} van ${geslaagd + mislukt} tests mislukt.`
);
process.exit(mislukt === 0 ? 0 : 1);
