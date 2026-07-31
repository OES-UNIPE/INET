# Mapa de Institucionalizacion COPETyP

Aplicacion web interactiva para visualizar el nivel de institucionalizacion de los Consejos Provinciales de Educacion, Trabajo y Produccion o instancias equivalentes, a partir del relevamiento jurisdiccional COPETyP.

La app integra en una sola pagina:

- mapa de Argentina por jurisdiccion;
- clasificacion cualitativa por nivel de institucionalizacion;
- tabla general comparativa;
- detalle por jurisdiccion con dimensiones, componentes y respuestas;
- ficha completa del Consejo;
- capa opcional de escuelas ETP;
- exportacion a PDF en formato A4 para la jurisdiccion seleccionada.

## Descripcion breve

El Mapa de Institucionalizacion COPETyP ofrece una lectura aproximativa, rapida e intuitiva de la situacion actual de los Consejos jurisdiccionales. La clasificacion se construye a partir de informacion brindada por las jurisdicciones en el formulario de relevamiento y debe leerse junto con una interpretacion cualitativa y situada.

Los niveles posibles son:

- `Consolidado`
- `Intermedio`
- `Incipiente`


## Fuentes de datos

La aplicacion carga:

- CSV publicado desde Google Sheets con respuestas del relevamiento jurisdiccional.
- `assets/Argentina.geojson` para los poligonos provinciales.
- `assets/escuelas.geojson` para la capa opcional de escuelas ETP.

La app toma la ultima respuesta disponible por jurisdiccion segun la marca temporal del formulario.

## Metodologia de clasificacion

La clasificacion se organiza en cuatro dimensiones:

- `D1. Institucionalizacion formal` - 30%
- `D2. Funcionamiento efectivo` - 30%
- `D3. Articulacion y representatividad` - 20%
- `D4. Vinculacion con PP y ETP` - 20%

Cada componente aporta hasta 1 punto. Algunos componentes admiten puntajes parciales de `0,5`.

La formula global es:

```text
Global = D1 x 0,30 + D2 x 0,30 + D3 x 0,20 + D4 x 0,20
```

Ademas, se aplican criterios de piso:

- Para superar `Incipiente`, D1 y D2 deben alcanzar al menos nivel `Intermedio`.
- Para alcanzar `Consolidado`, D1 y D2 deben estar `Consolidadas`.
- Para alcanzar `Consolidado`, tambien debe existir informacion en todas las dimensiones y el puntaje global debe ser igual o superior a 65.

## Estructura del proyecto

```text
consejos/
  index.html
  README.md
  assets/
    Argentina.geojson
    escuelas.geojson
    img/
  css/
    base.css
    layout.css
    components.css
  js/
    main.js
    config/
      fields.js
    services/
      data-service.js
      geo-service.js
      institutionalization-service.js
    components/
      map-view.js
      summary-table.js
      institutionalization-detail.js
      ficha-consejo.js
    utils/
      csv-parser.js
      normalize.js
```

## Arquitectura

La aplicacion esta organizada como una SPA modular sin dependencias de build. Usa JavaScript ES Modules nativos.

- `config/fields.js`: nombres de columnas y URL del CSV.
- `services/data-service.js`: carga, parseo y seleccion de la ultima respuesta por jurisdiccion.
- `services/institutionalization-service.js`: reglas de puntaje, dimensiones, niveles y pisos metodologicos.
- `services/geo-service.js`: normalizacion y union entre jurisdicciones y provincias del GeoJSON.
- `components/map-view.js`: mapa Leaflet, seleccion de provincia y capa de escuelas.
- `components/summary-table.js`: tabla general.
- `components/institutionalization-detail.js`: detalle de institucionalizacion.
- `components/ficha-consejo.js`: ficha completa del Consejo.
- `utils/`: funciones compartidas de parseo, normalizacion y formato.

## Funcionalidades principales

- Coloreo de provincias por nivel de institucionalizacion.
- Seleccion desde mapa o tabla.
- Deseleccion con segundo click en provincia o click sobre zona vacia del mapa.
- Zoom automatico a la provincia seleccionada.
- Tabla general plegable al seleccionar una jurisdiccion.
- Capa opcional de escuelas ETP con panel flotante de filtros.
- Modal metodologico con puntajes por pregunta.
- Exportacion a PDF en A4, con ficha desplegada completa y nombre sugerido `COPETyP_NOMBREJURISDICCION`.

## Dependencias externas

La app utiliza Leaflet desde CDN:

```html
https://unpkg.com/leaflet@1.9.4/dist/leaflet.css
https://unpkg.com/leaflet@1.9.4/dist/leaflet.js
```

El mapa base utiliza tiles del Instituto Geografico Nacional de Argentina.

## Notas

- La clasificacion es una herramienta de aproximacion y no reemplaza el analisis cualitativo de cada caso.
- Los datos dependen de la disponibilidad del CSV publicado.
- Para despliegue en GitHub Pages, alcanza con subir esta carpeta y servir `index.html`.
