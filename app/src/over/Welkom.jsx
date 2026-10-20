/**
 * Welkom.jsx
 *
 * Melding bij eerste gebruik (0.21.0, onderwerp 4, keuzes A1/A3): over de
 * app heen, met één knop "Begrepen". Wanneer hij verschijnt: welkom.js.
 */
import { createPortal } from 'react-dom'
import './Over.css'

function Welkom({ onBegrepen }) {
  return createPortal(
    <div className="over-achtergrond" role="dialog" aria-modal="true" aria-labelledby="welkom-titel">
      <div className="over-venster">
        <h2 id="welkom-titel" className="over-titel">
          Welkom bij WikiPoi
        </h2>
        <p>WikiPoi zoekt bezienswaardigheden langs je route en leest ze onderweg voor.</p>
        <ul className="over-lijst">
          <li>
            <strong>Let op het verkeer.</strong> Kijk onderweg niet naar het scherm: WikiPoi is gemaakt om
            te luisteren.
          </li>
          <li>
            <strong>Eco-scherm:</strong> een zwart scherm dat de accu spaart en alleen bij een POI iets toont.{' '}
            <strong>1× tikken</strong> = fietsbel, <strong>3× snel tikken</strong> = terug naar het gewone
            scherm.
          </li>
          <li>
            <strong>Locatie:</strong> blijft op je telefoon. Je route, track en logboek gaan alleen weg als je
            zelf op "Delen" tikt.
          </li>
          <li>
            <strong>Internet</strong> is nodig voor het zoeken en de samenvattingen (Wikidata, Wikipedia,
            OpenStreetMap).
          </li>
          <li>
            <strong>Bèta:</strong> de teksten komen uit Wikipedia en kunnen fouten bevatten.
          </li>
        </ul>
        <p className="over-klein">Meer, zoals licentie en bronnen: tik op ⓘ rechtsboven.</p>
        <button type="button" className="btn btn-green btn-wide" onClick={onBegrepen}>
          Begrepen
        </button>
      </div>
    </div>,
    document.body
  )
}

export default Welkom
