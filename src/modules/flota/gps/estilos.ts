// Estilos del mapa Noche (neón), Día y Satélite. Copiado literal de buildStyle() del prototipo.
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { LayerSpecification, StyleSpecification } from 'maplibre-gl';
import { ATRIBUCION, MAPA_URLS, SAT_BASE_MAXZOOM, SAT_DETALLE_MAXZOOM, SAT_MAPBOX, SAT_MAPBOX_MAXZOOM, SAT_MAPBOX_URL, SAT_MEDIA_MAXZOOM } from './mapaConfig';

export type TemaMapa = 'night' | 'day' | 'sat';

export const F_REG = ['Noto Sans Regular'], F_BOLD = ['Noto Sans Bold'];
export const W = (pairs: Array<number>): any[] => ['interpolate', ['exponential', 1.6], ['zoom'], ...pairs];
const isCls = (list: string[]) => ['match', ['get', 'class'], list, true, false];
export function buildStyle(t: TemaMapa, relieve: boolean): StyleSpecification {
  const night = t === 'night', sat = t === 'sat';
  const P = night ? {bg:'#070a11', water:'#071624', park:'#0a1712', res:'#0a0e16', minor:'#182233', sec:'#22324a', pri:'#2a587a', maj:'#ff9440', label:'#a9bbd0', halo:'#04060b', bld:['#0f1a2a','#173452','#1f5a8a','#2b9fd2']}
                  : {bg:'#eef0f3', water:'#a7d2f0', park:'#d3ead2', res:'#e8eaee', minor:'#ffffff', sec:'#ffffff', pri:'#fff6dc', maj:'#ffbf55', label:'#465163', halo:'#ffffff', bld:['#e4e7ed','#d9dee6','#cdd4df','#bfc8d6']};
  const L: LayerSpecification[] = [];
  if (sat){
    L.push(<any>{id:'bg', type:'background', paint:{'background-color':'#0b0f14'}});
    const pintura = {'raster-saturation':-0.05, 'raster-contrast':0.06, 'raster-fade-duration':150};
    L.push(<any>{id:'sat', type:'raster', source:'sat', paint:pintura});
    if (!SAT_MAPBOX) {
      // Las capas de más zoom van encima: donde Esri no tiene imágenes son transparentes y se ve la de abajo
      L.push(<any>{id:'sat-media', type:'raster', source:'sat-media', minzoom:SAT_BASE_MAXZOOM - 0.5, paint:pintura});
      L.push(<any>{id:'sat-detalle', type:'raster', source:'sat-detalle', minzoom:SAT_MEDIA_MAXZOOM - 0.5, paint:pintura});
    }
  } else {
    L.push(<any>{id:'bg', type:'background', paint:{'background-color':P.bg}});
    L.push(<any>{id:'landuse', type:'fill', source:'omt', 'source-layer':'landuse', filter:isCls(['residential','suburb','neighbourhood','commercial','industrial']), paint:{'fill-color':P.res, 'fill-opacity':.8}});
    L.push(<any>{id:'park', type:'fill', source:'omt', 'source-layer':'park', paint:{'fill-color':P.park, 'fill-opacity':.9}});
    L.push(<any>{id:'landcover', type:'fill', source:'omt', 'source-layer':'landcover', filter:isCls(['grass','wood','farmland']), paint:{'fill-color':P.park, 'fill-opacity':.6}});
    L.push(<any>{id:'water', type:'fill', source:'omt', 'source-layer':'water', paint:{'fill-color':P.water}});
    if (night) L.push(<any>{id:'water-edge', type:'line', source:'omt', 'source-layer':'water', paint:{'line-color':'#164a6e', 'line-width':1, 'line-blur':1.5, 'line-opacity':.7}});
    L.push(<any>{id:'hillshade', type:'hillshade', source:'dem', maxzoom:15, paint:night
      ? {'hillshade-shadow-color':'#000000', 'hillshade-highlight-color':'#1b3550', 'hillshade-accent-color':'#0b1626', 'hillshade-exaggeration':.55}
      : {'hillshade-shadow-color':'#8a8f99', 'hillshade-highlight-color':'#ffffff', 'hillshade-accent-color':'#b8bcc4', 'hillshade-exaggeration':.35}});
    L.push(<any>{id:'aeroway', type:'fill', source:'omt', 'source-layer':'aeroway', filter:['==', ['geometry-type'], 'Polygon'], paint:{'fill-color':night ? '#141c2a' : '#dfe2e8'}});
    if (!night){
      L.push(<any>{id:'road-sec-case', type:'line', source:'omt', 'source-layer':'transportation', filter:isCls(['secondary','tertiary','primary']), layout:{'line-cap':'round','line-join':'round'}, paint:{'line-color':'#d3d8e0', 'line-width':W([8,.8,18,22])}});
      L.push(<any>{id:'road-maj-case', type:'line', source:'omt', 'source-layer':'transportation', filter:isCls(['motorway','trunk']), layout:{'line-cap':'round','line-join':'round'}, paint:{'line-color':'#e0a640', 'line-width':W([6,1,18,26])}});
    }
    L.push(<any>{id:'road-minor', type:'line', source:'omt', 'source-layer':'transportation', filter:isCls(['minor','service']), minzoom:12, layout:{'line-cap':'round','line-join':'round'}, paint:{'line-color':P.minor, 'line-width':W([12,.4,16,4,19,14])}});
    L.push(<any>{id:'rail', type:'line', source:'omt', 'source-layer':'transportation', filter:isCls(['rail','transit']), paint:{'line-color':night ? '#2c3a52' : '#b9bfca', 'line-width':W([10,.6,18,3]), 'line-dasharray':[3,2]}});
    L.push(<any>{id:'road-sec', type:'line', source:'omt', 'source-layer':'transportation', filter:isCls(['secondary','tertiary']), layout:{'line-cap':'round','line-join':'round'}, paint:{'line-color':P.sec, 'line-width':W([9,.4,18,18])}});
    if (night) L.push(<any>{id:'road-pri-glow', type:'line', source:'omt', 'source-layer':'transportation', maxzoom:15, filter:isCls(['primary']), paint:{'line-color':'#38d6ff', 'line-opacity':.12, 'line-blur':4, 'line-width':W([8,2,18,40])}});
    L.push(<any>{id:'road-pri', type:'line', source:'omt', 'source-layer':'transportation', filter:isCls(['primary']), layout:{'line-cap':'round','line-join':'round'}, paint:{'line-color':night ? ['interpolate', ['linear'], ['zoom'], 13, P.pri, 16, '#162a3a'] : P.pri, 'line-width':W([8,.6,18,20])}});
    if (night) L.push(<any>{id:'road-maj-glow', type:'line', source:'omt', 'source-layer':'transportation', maxzoom:15.5, filter:isCls(['motorway','trunk']), paint:{'line-color':'#ff7a1a', 'line-opacity':['interpolate', ['linear'], ['zoom'], 12, .22, 16, .08], 'line-blur':6, 'line-width':W([6,3,18,50])}});
    L.push(<any>{id:'road-maj', type:'line', source:'omt', 'source-layer':'transportation', filter:isCls(['motorway','trunk']), layout:{'line-cap':'round','line-join':'round'}, paint:{'line-color':night ? ['interpolate', ['linear'], ['zoom'], 13, P.maj, 15.5, '#2a1a10'] : P.maj, 'line-width':W([6,.8,18,22]), 'line-opacity':night ? .95 : 1}});
    if (night) L.push(<any>{id:'road-maj-edge', type:'line', source:'omt', 'source-layer':'transportation', minzoom:14, filter:isCls(['motorway','trunk']), layout:{'line-join':'round'}, paint:{'line-color':'#ff9440', 'line-width':['interpolate', ['linear'], ['zoom'], 14, .6, 18, 1.6], 'line-gap-width':W([14,4,18,22]), 'line-blur':.6, 'line-opacity':['interpolate', ['linear'], ['zoom'], 14, 0, 15.5, .95]}});
    // Pasos a desnivel: sombra sobre lo de abajo, borde y la calzada otra vez encima (se ven como puentes reales)
    const puente = ['==', ['get','brunnel'], 'bridge'];
    const clasesPuente = isCls(['motorway','trunk','primary','secondary','tertiary']);
    L.push(<any>{id:'bridge-shadow', type:'line', source:'omt', 'source-layer':'transportation', minzoom:14, filter:['all', puente, clasesPuente], layout:{'line-join':'round'}, paint:{'line-color':'#000000', 'line-opacity':night ? .55 : .2, 'line-blur':3.5, 'line-translate':[0, 5], 'line-width':W([13,1.6,18,28])}});
    L.push(<any>{id:'bridge-casing', type:'line', source:'omt', 'source-layer':'transportation', minzoom:14, filter:['all', puente, clasesPuente], layout:{'line-join':'round'}, paint:{'line-color':night ? '#0b1422' : '#bcc2cd', 'line-width':W([13,1.4,18,27])}});
    L.push(<any>{id:'bridge-road', type:'line', source:'omt', 'source-layer':'transportation', minzoom:14, filter:['all', puente, clasesPuente], layout:{'line-join':'round'}, paint:{'line-color':['match', ['get','class'], ['motorway','trunk'], P.maj, 'primary', night ? '#1b3a52' : '#fff6dc', night ? '#22324a' : '#ffffff'], 'line-width':W([13,.9,18,22])}});
    // Línea central discontinua: la vía se lee como carriles al acercarse
    L.push(<any>{id:'road-center', type:'line', source:'omt', 'source-layer':'transportation', minzoom:15.3, filter:isCls(['motorway','trunk','primary','secondary','tertiary']), layout:{'line-join':'round'}, paint:{'line-color':night ? '#ffd27a' : '#aab1bf', 'line-opacity':night ? .5 : .75, 'line-dasharray':[4, 5], 'line-width':W([15.3,.4,19,2.2])}});
  }
  if (sat){
    L.push(<any>{id:'road-maj', type:'line', source:'omt', 'source-layer':'transportation', filter:isCls(['motorway','trunk']), paint:{'line-color':'#ffb347', 'line-opacity':.55, 'line-width':W([8,.8,18,8])}});
    L.push(<any>{id:'road-pri', type:'line', source:'omt', 'source-layer':'transportation', filter:isCls(['primary']), minzoom:12, paint:{'line-color':'#ffffff', 'line-opacity':.3, 'line-width':W([12,.6,18,5])}});
  }
  // Sombra proyectada en el suelo (hacia abajo y a la izquierda): da peso y profundidad a los edificios
  L.push(<any>{id:'bld-shadow', type:'fill', source:'omt', 'source-layer':'building', minzoom:14, layout:{visibility:sat ? 'none' : 'visible'}, paint:{
    'fill-color':night ? '#000000' : '#39445a', 'fill-opacity':['interpolate', ['linear'], ['zoom'], 14, 0, 15.5, night ? .6 : .24], 'fill-translate':[-5, 7], 'fill-translate-anchor':'viewport'}});
  L.push(<any>{id:'buildings', type:'fill-extrusion', source:'omt', 'source-layer':'building', minzoom:13.5, layout:{visibility:sat ? 'none' : 'visible'}, paint:{
    'fill-extrusion-color':['interpolate', ['linear'], ['coalesce', ['get','render_height'], 9], 0, P.bld[0], 12, P.bld[0], 25, P.bld[1], 70, P.bld[2], 180, P.bld[3]],
    'fill-extrusion-height':['interpolate', ['linear'], ['zoom'], 13.5, 0, 14.5, ['coalesce', ['get','render_height'], 9]],
    'fill-extrusion-base':['coalesce', ['get','render_min_height'], 0], 'fill-extrusion-opacity':night ? .92 : .85, 'fill-extrusion-vertical-gradient':true}});
  const labelPaint = {'text-color':sat ? '#ffffff' : P.label, 'text-halo-color':sat ? 'rgba(0,0,0,.75)' : P.halo, 'text-halo-width':1.4};
  L.push(<any>{id:'road-label', type:'symbol', source:'omt', 'source-layer':'transportation_name', minzoom:13.5, filter:isCls(['motorway','trunk','primary','secondary','tertiary']), layout:{'symbol-placement':'line', 'text-field':['coalesce', ['get','name:es'], ['get','name']], 'text-font':F_REG, 'text-size':11, 'text-letter-spacing':.04}, paint:labelPaint});
  // Lugares y negocios del mapa base (OpenStreetMap): puntos y nombres que aparecen al acercarse. Los más importantes salen primero.
  const poiNombre = ['coalesce', ['get','name:es'], ['get','name']];
  L.push(<any>{id:'poi-dot', type:'circle', source:'omt', 'source-layer':'poi', minzoom:14.5, filter:['all', ['has','name'], ['<=', ['coalesce', ['get','rank'], 99], 25]],
    paint:{'circle-radius':['interpolate', ['linear'], ['zoom'], 14.5, 2.2, 18, 4], 'circle-color':sat ? '#ffffff' : (night ? '#7fb2ff' : '#5b7bd6'), 'circle-stroke-color':sat ? 'rgba(0,0,0,.7)' : P.halo, 'circle-stroke-width':1.2, 'circle-opacity':['interpolate', ['linear'], ['zoom'], 14.5, 0, 15.2, .95]}});
  L.push(<any>{id:'poi-label', type:'symbol', source:'omt', 'source-layer':'poi', minzoom:15, filter:['all', ['has','name'], ['any', ['<=', ['coalesce', ['get','rank'], 99], 8], ['>=', ['zoom'], 16.2]]],
    layout:{'text-field':poiNombre, 'text-font':F_REG, 'text-size':['interpolate', ['linear'], ['zoom'], 15, 10, 18, 12.5], 'text-anchor':'top', 'text-offset':[0, .7], 'text-max-width':8, 'text-optional':true, 'symbol-sort-key':['coalesce', ['get','rank'], 99]},
    paint:{'text-color':sat ? '#ffffff' : (night ? '#c4d4ea' : '#3b4660'), 'text-halo-color':sat ? 'rgba(0,0,0,.8)' : P.halo, 'text-halo-width':1.4}});
  L.push(<any>{id:'place-label', type:'symbol', source:'omt', 'source-layer':'place', filter:isCls(['city','town','suburb','neighbourhood','village']), layout:{'text-field':['coalesce', ['get','name:es'], ['get','name']], 'text-font':['match', ['get','class'], ['city','town'], ['literal', F_BOLD], ['literal', F_REG]], 'text-size':['match', ['get','class'], 'city', 16, 'town', 13, 11.5], 'text-transform':['match', ['get','class'], ['suburb','neighbourhood'], 'uppercase', 'none'], 'text-letter-spacing':['match', ['get','class'], ['suburb','neighbourhood'], .12, .02], 'text-max-width':8}, paint:labelPaint});
  const sky = night ? {'sky-color':'#03050a', 'horizon-color':'#0d2238', 'fog-color':'#04070d', 'sky-horizon-blend':.6, 'horizon-fog-blend':.7, 'fog-ground-blend':.55, 'atmosphere-blend':.2}
    : sat ? {'sky-color':'#5d9ae0', 'horizon-color':'#cfe2f5', 'fog-color':'#c6d4e2', 'sky-horizon-blend':.5, 'horizon-fog-blend':.6, 'fog-ground-blend':.6, 'atmosphere-blend':.6}
    : {'sky-color':'#7db4f2', 'horizon-color':'#eaf2fb', 'fog-color':'#e9eef5', 'sky-horizon-blend':.55, 'horizon-fog-blend':.7, 'fog-ground-blend':.7, 'atmosphere-blend':.6};
  const style: any = {version:8, glyphs:MAPA_URLS.tipografias,
    sources:{omt:{type:'vector', url:MAPA_URLS.vectores, attribution:ATRIBUCION.vectores},
      dem:{type:'raster-dem', tiles:[MAPA_URLS.relieve], encoding:'terrarium', tileSize:256, maxzoom:14, attribution:ATRIBUCION.relieve}},
    projection:{type:'mercator'}, sky, light:{anchor:'viewport', color:night ? '#a9c8ff' : '#ffffff', intensity:night ? .38 : .3, position:[1.2, 200, 35]}, layers:L};
  if (relieve) style.terrain = {source:'dem', exaggeration:1.35};
  if (sat) {
    if (SAT_MAPBOX) {
      // Una sola fuente en todos los zooms: el color no cambia al acercarse o alejarse
      style.sources.sat = {type:'raster', tiles:[SAT_MAPBOX_URL], tileSize:512, maxzoom:SAT_MAPBOX_MAXZOOM - 1, attribution:ATRIBUCION.mapbox};
    } else {
      // Las tres capas pasan por el mismo protocolo (Clarity primero, Esri estándar de respaldo) para que el color sea el mismo
      style.sources.sat = {type:'raster', tiles:['esri://{z}/{y}/{x}'], tileSize:256, maxzoom:SAT_BASE_MAXZOOM, attribution:ATRIBUCION.satelite};
      style.sources['sat-media'] = {type:'raster', tiles:['esri://{z}/{y}/{x}'], tileSize:256, maxzoom:SAT_MEDIA_MAXZOOM};
      style.sources['sat-detalle'] = {type:'raster', tiles:['esri://{z}/{y}/{x}'], tileSize:256, maxzoom:SAT_DETALLE_MAXZOOM};
    }
  }
  return style;
}
