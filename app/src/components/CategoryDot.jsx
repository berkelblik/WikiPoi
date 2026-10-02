// Klein categorieteken voor de lijsten (stap 2, 4, 5 en Onderweg): een
// gekleurd rondje in de categoriekleur, of — bij een categorie met
// shape 'tegel', zoals "Eigen POI" — een verkleind icoon als afgeronde
// tegel (wit "WP" op de verloopkleur van het WikiPoi-icoon), net als op de
// kaart (poi-icons.js#markerHtml).
import { getCategoryStyle, iconSvg } from './poi-icons.js'

function CategoryDot({ categoryKey, faded }) {
  const style = getCategoryStyle(categoryKey)
  const opacity = faded ? 0.45 : 1
  if (style.shape === 'tegel') {
    return (
      <span
        aria-hidden="true"
        className="category-dot category-tegel"
        style={{ background: style.background || style.color, opacity }}
        dangerouslySetInnerHTML={{ __html: iconSvg(style.icon, 14) }}
      />
    )
  }
  return <span aria-hidden="true" className="category-dot" style={{ background: style.color, opacity }} />
}

export default CategoryDot
