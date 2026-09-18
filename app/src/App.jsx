import { useState } from 'react'
import '../../src/europoi-csv.js'
import './App.css'

function App() {
  const [csv, setCsv] = useState('')

  function runSmokeTest() {
    const testPois = [
      {
        lat: 52.1326,
        lng: 6.2233,
        name: 'Testpunt Zutphen',
        desc: 'Smoketest voor de fase 1-integratie.',
        category: 'Testroute',
        radius: 50,
        mp3: '',
      },
    ]
    const result = window.EuroPoiCsv.toEuroPoiCsv(testPois)
    setCsv(result)
  }

  return (
    <>
      <h1>WikiPoi — smoketest</h1>
      <button onClick={runSmokeTest}>Genereer testregel via europoi-csv.js</button>
      {csv && (
        <pre style={{ textAlign: 'left', background: '#eee', padding: '1em' }}>
          {csv}
        </pre>
      )}
    </>
  )
}

export default App