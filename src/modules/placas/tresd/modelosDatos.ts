/**
 * Datos de los modelos 3D de la flota. Cotas en metros.
 * Copia literal de docs/referencia/flota-3d.html (MODELS, TLABEL, variant, truckBase).
 * Sin three: solo datos y funciones puras, para poder usarlos desde datos.ts sin cargar la escena.
 *
 * Convención de cotas: x hacia delante (0 = eje delantero), y hacia arriba, z hacia la derecha.
 */

export interface ModeloDef {
  id: string;
  brand: string;
  short: string;
  title: string;
  badge?: string;
  sub: string;
  kind: 'tractor' | 'box' | 'tipper' | 'cargo' | 'trailer' | 'car';
  paint: number;
  ttype?: string;
  specs?: [string, string][];
  [k: string]: any;
}

/** Etiquetas de las carretas (cada una es una placa propia y se ve sola, sin tracto). */
export const TLABEL: Record<string, string> = {
  plataforma: 'Plataforma',
  furgon: 'Furgón',
  frio: 'Furgón frío',
  cisterna: 'Cisterna',
  tolva: 'Tolva',
};

export const MODELS: ModeloDef[] = [
{ id:'r500', brand:'Scania', short:'R 500', title:'Scania R500', badge:'R 500', sub:'Tracto 4x2 · Cabina R Highline',
  kind:'tractor', paint:0x9e1b22, grille:'scania', lampsOn:'bumper', lampStyle:'scania', roofKit:'visor', engCover:0xb8232b, sleeper:true,
  cab:{bottom:1.30, roof:3.80, rc:0.2, back:-0.95,
    front:[[1.30,1.47],[1.62,1.52],[2.22,1.535],[3.0,1.43],[3.25,1.36],[3.80,1.2]],
    hw:[[1.3,1.235],[2.2,1.25],[3.0,1.235],[3.8,1.21]], rF:[[1.3,0.22],[2.2,0.26],[3.0,0.3],[3.8,0.34]], rB:0.1,
    ws:[2.27,3.0], uWs:1.42, door:{x0:-0.25,y0:1.42,wy0:2.25}, bunkWin:[-0.8,-0.42,2.55,2.95], grille:{u:0.8,y0:1.47,y1:2.16}},
  R:0.52, track:1.04, axles:[{x:0,t:'steer'},{x:-3.7,t:'drive'}], frameEnd:-5.0, fifth:-3.5,
  engine:{len:1.15,h:0.5,name:'Motor Scania DC13',desc:'6 cilindros en línea de 12,7 litros con turbo, inyección XPI y postratamiento SCR. Entrega 500 CV y 2.550 Nm.'},
  gearbox:{name:'Caja Opticruise', desc:'Caja automatizada GRS905 de 12 marchas más 2 superdirectas, con retarder integrado.'},
  cabName:'Cabina R Highline', cabDesc:'Cabina larga de techo alto con litera. Bascula hacia delante sobre su bisagra frontal para dejar el motor al descubierto.',
  specs:[['Motor','DC13 · 6 cil. en línea'],['Cilindrada','12,7 l'],['Potencia','500 CV · 1.900 rpm'],['Par máximo','2.550 Nm'],['Cambio','Opticruise 12+2'],['Configuración','Tracto 4x2'],['Entre ejes','3,70 m'],['Alto total','≈ 3,8 m']]},

{ id:'p460', brand:'Scania', short:'P 460', title:'Scania P460', badge:'P 460', sub:'Tracto 4x2 · Cabina P con litera',
  kind:'tractor', paint:0xd9731c, grille:'scania', lampsOn:'bumper', lampStyle:'scania', roofKit:'deflector', defTop:3.85, engCover:0xb8232b, sleeper:true,
  cab:{bottom:1.15, roof:3.1, rc:0.16, back:-0.9,
    front:[[1.15,1.40],[1.45,1.45],[1.98,1.465],[2.72,1.37],[2.9,1.32],[3.1,1.2]],
    hw:[[1.15,1.235],[2.0,1.25],[3.1,1.22]], rF:[[1.15,0.22],[2.0,0.26],[3.1,0.32]], rB:0.1,
    ws:[2.0,2.72], uWs:1.42, door:{x0:-0.32,y0:1.27,wy0:1.98}, bunkWin:[-0.78,-0.45,2.3,2.62], grille:{u:0.8,y0:1.32,y1:1.92}},
  R:0.52, track:1.04, axles:[{x:0,t:'steer'},{x:-3.7,t:'drive'}], frameEnd:-5.0, fifth:-3.5,
  engine:{len:1.15,h:0.5,name:'Motor Scania DC13',desc:'6 cilindros en línea de 12,7 litros con turbo y SCR. Entrega 460 CV y 2.350 Nm.'},
  gearbox:{name:'Caja Opticruise', desc:'Caja automatizada GRS905 de 12 marchas más 2 superdirectas, con retarder integrado.'},
  cabName:'Cabina P con litera', cabDesc:'Cabina más baja que la de la serie R, con techo normal y litera. El deflector de techo iguala la altura del semirremolque. Bascula hacia delante para acceder al motor.',
  specs:[['Motor','DC13 · 6 cil. en línea'],['Cilindrada','12,7 l'],['Potencia','460 CV · 1.900 rpm'],['Par máximo','2.350 Nm'],['Cambio','Opticruise 12+2'],['Configuración','Tracto 4x2'],['Entre ejes','3,70 m'],['Alto total','≈ 3,85 m']]},

{ id:'fh', brand:'Volvo', short:'FH', title:'Volvo FH 500', badge:'FH 500', sub:'Tracto 4x2 · Cabina Globetrotter XL',
  kind:'tractor', paint:0x24395c, grille:'volvo', lampsOn:'cab', lampStyle:'volvo', roofKit:'lights', engCover:0x3c4a5a, sleeper:true, peep:true,
  cab:{bottom:1.32, roof:3.98, rc:0.24, back:-0.98,
    front:[[1.32,1.48],[1.7,1.55],[2.2,1.555],[3.02,1.44],[3.3,1.40],[3.98,1.28]],
    hw:[[1.32,1.24],[2.2,1.25],[3.98,1.215]], rF:[[1.32,0.28],[2.2,0.3],[3.02,0.31],[3.98,0.36]], rB:0.1,
    ws:[2.22,3.02], uWs:1.38, door:{x0:-0.22,y0:1.44,wy0:2.2}, bunkWin:null, grille:{u:0.62,y0:1.44,y1:2.17}, lamp:{u0:0.74,u1:1.74,y0:1.42,y1:1.8}},
  R:0.52, track:1.04, axles:[{x:0,t:'steer'},{x:-3.7,t:'drive'}], frameEnd:-5.0, fifth:-3.5,
  engine:{len:1.15,h:0.5,name:'Motor Volvo D13',desc:'6 cilindros en línea de 12,8 litros con turbo y SCR. Entrega 500 CV y 2.500 Nm.'},
  gearbox:{name:'Caja I-Shift', desc:'Caja automatizada de 12 marchas con cambio predictivo según el relieve de la carretera.'},
  cabName:'Cabina Globetrotter XL', cabDesc:'La cabina más alta de Volvo, con litera y techo plano frontal. La puerta del acompañante lleva una ventanilla baja para ver el bordillo.',
  specs:[['Motor','D13 · 6 cil. en línea'],['Cilindrada','12,8 l'],['Potencia','500 CV'],['Par máximo','2.500 Nm'],['Cambio','I-Shift 12'],['Configuración','Tracto 4x2'],['Entre ejes','3,70 m'],['Alto total','≈ 4,0 m']]},

{ id:'fm', brand:'Volvo', short:'FM', title:'Volvo FM 460', badge:'FM 460', sub:'Tracto 6x2 · Cabina Globetrotter',
  kind:'tractor', paint:0xe9ecef, grille:'volvo', lampsOn:'cab', lampStyle:'volvo', roofKit:'deflector', defTop:3.95, engCover:0x3c4a5a, sleeper:true, peep:true,
  cab:{bottom:1.2, roof:3.25, rc:0.18, back:-0.9,
    front:[[1.2,1.45],[1.55,1.51],[2.05,1.52],[2.82,1.41],[3.05,1.35],[3.25,1.27]],
    hw:[[1.2,1.24],[2.05,1.25],[3.25,1.22]], rF:[[1.2,0.27],[2.05,0.29],[3.25,0.33]], rB:0.1,
    ws:[2.07,2.82], uWs:1.38, door:{x0:-0.22,y0:1.32,wy0:2.05}, bunkWin:[-0.75,-0.42,2.4,2.72], grille:{u:0.6,y0:1.32,y1:2.03}, lamp:{u0:0.72,u1:1.72,y0:1.3,y1:1.64}},
  R:0.52, track:1.04, axles:[{x:0,t:'steer'},{x:-3.4,t:'drive'},{x:-4.75,t:'tag'}], frameEnd:-5.85, fifth:-3.95,
  engine:{len:1.15,h:0.5,name:'Motor Volvo D13',desc:'6 cilindros en línea de 12,8 litros. En esta versión da 460 CV y 2.300 Nm.'},
  gearbox:{name:'Caja I-Shift', desc:'Caja automatizada de 12 marchas. Controla también la elevación del tercer eje según la carga.'},
  cabName:'Cabina Globetrotter', cabDesc:'Cabina de techo normal con litera. El deflector de techo iguala la altura del semirremolque para ahorrar combustible.',
  specs:[['Motor','D13 · 6 cil. en línea'],['Cilindrada','12,8 l'],['Potencia','460 CV'],['Par máximo','2.300 Nm'],['Cambio','I-Shift 12'],['Configuración','Tracto 6x2'],['Entre ejes','3,40 + 1,35 m'],['Alto total','≈ 3,95 m']]},

{ id:'vm', brand:'Volvo', short:'VM', title:'Volvo VM 330', badge:'VM 330', sub:'Camión 4x2 furgón · Cabina corta',
  kind:'box', paint:0x1f5aa6, grille:'vm', lampsOn:'bumper', lampStyle:'vm', roofKit:'deflector', defTop:3.5, engCover:0x3c4a5a, sleeper:false,
  cab:{bottom:1.1, roof:2.82, rc:0.15, back:-0.35,
    front:[[1.1,1.36],[1.4,1.4],[1.86,1.41],[2.56,1.33],[2.7,1.28],[2.82,1.2]],
    hw:[[1.1,1.13],[2.82,1.11]], rF:[[1.1,0.18],[2.82,0.22]], rB:0.08,
    ws:[1.88,2.56], uWs:1.4, door:{x0:-0.2,y0:1.2,wy0:1.86}, bunkWin:null, grille:{u:0.7,y0:1.2,y1:1.82}},
  R:0.5, track:0.98, axles:[{x:0,t:'steer'},{x:-4.8,t:'drive'}], frameEnd:-7.0,
  engine:{len:0.95,h:0.44,name:'Motor Volvo D8',desc:'6 cilindros en línea de unos 7,7 litros, con 330 CV. Más ligero y compacto que el D13.'},
  gearbox:{name:'Caja de cambios', desc:'Caja manual o automatizada I-Shift según versión, con reductora para arranques con carga.'},
  cabName:'Cabina corta', cabDesc:'Cabina de día, más estrecha que la de los FH y FM, pensada para distribución regional.',
  specs:[['Motor','D8 · 6 cil. en línea'],['Cilindrada','≈ 7,7 l'],['Potencia','330 CV'],['Par máximo','≈ 1.250 Nm'],['Cambio','Manual / I-Shift'],['Configuración','Camión 4x2 furgón'],['Entre ejes','4,80 m'],['Alto total','≈ 3,6 m']]},

{ id:'xf', brand:'DAF', short:'XF', title:'DAF XF 480', badge:'XF 480', sub:'Tracto 4x2 · Cabina Space Cab',
  kind:'tractor', paint:0x5d6f80, grille:'daf', lampsOn:'cab', lampStyle:'daf', roofKit:'lights', engCover:0x2d3238, sleeper:true,
  cab:{bottom:1.36, roof:4.0, rc:0.28, back:-1.05,
    front:[[1.36,1.5],[1.75,1.58],[2.3,1.585],[3.12,1.44],[3.4,1.38],[4.0,1.22]],
    hw:[[1.36,1.24],[2.3,1.25],[4.0,1.2]], rF:[[1.36,0.34],[2.3,0.38],[3.12,0.4],[4.0,0.46]], rB:0.12,
    ws:[2.32,3.12], uWs:1.48, door:{x0:-0.28,y0:1.48,wy0:2.3}, bunkWin:[-0.88,-0.5,2.65,3.0], grille:{u:0.72,y0:1.5,y1:2.28}, lamp:{u0:0.82,u1:1.8,y0:1.48,y1:1.86}},
  R:0.52, track:1.04, axles:[{x:0,t:'steer'},{x:-3.8,t:'drive'}], frameEnd:-5.1, fifth:-3.6,
  engine:{len:1.15,h:0.5,name:'Motor PACCAR MX-13',desc:'6 cilindros en línea de 12,9 litros. Da 480 CV y unos 2.500 Nm.'},
  gearbox:{name:'Caja TraXon', desc:'Caja automatizada de 12 marchas fabricada por ZF, con gestión predictiva del cambio.'},
  cabName:'Cabina Space Cab', cabDesc:'Cabina larga y de techo alto, con esquinas muy redondeadas y parabrisas que envuelve los laterales.',
  specs:[['Motor','MX-13 · 6 cil. en línea'],['Cilindrada','12,9 l'],['Potencia','480 CV'],['Par máximo','≈ 2.500 Nm'],['Cambio','TraXon 12'],['Configuración','Tracto 4x2'],['Entre ejes','3,80 m'],['Alto total','≈ 4,0 m']]},

/* ---- Capó largo (convencionales) ---- */
{ id:'lt', brand:'International', short:'LT', title:'International LT', badge:'LT', sub:'Tracto 6x4 · Capó largo con dormitorio',
  kind:'tractor', paint:0x1f5aa6, grille:'intl', lampsOn:'cab', lampStyle:'conv', roofKit:'deflector', defTop:4.05, engCover:0x2d3238, sleeper:true, chromeBumper:true, stacks:2,
  conv:{y0:0.72, y1:1.86, rc:0.3, back:-0.85, engX0:0.72,
    front:[[0.72,1.34],[1.2,1.38],[1.5,1.3],[1.86,0.8]], hw:[[0.72,1.22],[1.12,1.2],[1.45,1.0],[1.86,0.86]], rF:[[0.72,0.5],[1.45,0.45],[1.86,0.36]],
    grille:{u:0.9,y0:0.84,y1:1.6}, lamp:{u0:1.02,u1:1.62,y0:1.0,y1:1.3}},
  cab:{bottom:1.18, roof:3.3, rc:0.18, back:-3.25,
    front:[[1.18,-0.78],[1.9,-0.8],[1.98,-0.84],[2.75,-1.3],[3.0,-1.5],[3.3,-1.75]],
    hw:[[1.18,1.2],[2.0,1.22],[3.3,1.18]], rF:[[1.18,0.25],[2.0,0.3],[3.3,0.35]], rB:0.1,
    ws:[2.0,2.74], uWs:1.25, door:{x0:-2.7,y0:1.3,wy0:1.98}, bunkWin:[-3.05,-2.8,2.25,2.6]},
  R:0.52, track:1.04, axles:[{x:0,t:'steer'},{x:-5.0,t:'drive'},{x:-6.32,t:'drive'}], frameEnd:-7.3, fifth:-5.6,
  engine:{len:1.25,h:0.52,name:'Motor Cummins X15',desc:'6 cilindros en línea de 14,9 litros, bajo el capó delante de la cabina. Unos 450 CV según calibración.'},
  gearbox:{name:'Caja Eaton Fuller', desc:'Caja manual de 18 velocidades con doble rango y divisor, muy habitual en los tractos de capó largo.'},
  cabName:'Cabina con dormitorio', cabDesc:'Cabina detrás del motor, con dormitorio integrado y deflector alto. Es la configuración de capó largo típica de los tractos americanos.',
  specs:[['Motor','Cummins X15 · 6 cil.'],['Cilindrada','14,9 l'],['Potencia','≈ 450 CV'],['Par máximo','≈ 2.240 Nm'],['Cambio','Eaton Fuller 18'],['Configuración','Tracto 6x4'],['Entre ejes','5,0 + 1,32 m'],['Alto total','≈ 4,05 m']]},

{ id:'i7600', brand:'International', short:'7600', title:'International 7600', badge:'7600', sub:'Camión 6x4 volquete · Capó largo',
  kind:'tipper', paint:0xe0a81a, grille:'intl', lampsOn:'cab', lampStyle:'conv', roofKit:'visor', engCover:0x2d3238, sleeper:false, chromeBumper:true,
  conv:{y0:0.75, y1:1.92, rc:0.12, back:-0.9, engX0:0.85,
    front:[[0.75,1.45],[1.8,1.48],[1.92,1.36]], hw:[[0.75,1.22],[1.14,1.2],[1.24,0.98],[1.92,0.94]], rF:[[0.75,0.32],[1.14,0.3],[1.24,0.18],[1.92,0.18]],
    grille:{u:0.92,y0:0.88,y1:1.8}, lamp:{u0:1.05,u1:1.85,y0:0.98,y1:1.16}},
  cab:{bottom:1.2, roof:3.15, rc:0.14, back:-2.75,
    front:[[1.2,-0.82],[1.96,-0.84],[2.05,-0.88],[2.85,-1.1],[3.15,-1.28]],
    hw:[[1.2,1.18],[2.0,1.2],[3.15,1.16]], rF:[[1.2,0.15],[3.15,0.2]], rB:0.08,
    ws:[2.07,2.82], uWs:1.2, door:{x0:-2.45,y0:1.32,wy0:2.05}, bunkWin:null},
  R:0.52, track:1.04, axles:[{x:0,t:'steer'},{x:-4.6,t:'drive'},{x:-5.95,t:'drive'}], frameEnd:-7.0,
  engine:{len:1.2,h:0.5,name:'Motor Cummins ISM',desc:'6 cilindros en línea de 10,8 litros bajo el capó. Alrededor de 400 CV según versión.'},
  gearbox:{name:'Caja Eaton Fuller', desc:'Caja manual de 18 velocidades, pensada para arrancar cargado en pendientes de obra y mina.'},
  cabName:'Cabina corta de capó largo', cabDesc:'Cabina de día detrás del motor. El capó largo deja el motor muy accesible y protege la cabina en un choque frontal.',
  specs:[['Motor','Cummins ISM · 6 cil.'],['Cilindrada','10,8 l'],['Potencia','≈ 400 CV'],['Par máximo','≈ 1.900 Nm'],['Cambio','Eaton Fuller 18'],['Configuración','Camión 6x4 volquete'],['Entre ejes','4,6 + 1,35 m'],['Alto total','≈ 3,2 m']]},

{ id:'cascadia', brand:'Freightliner', short:'Cascadia', title:'Freightliner Cascadia', badge:'CASCADIA', sub:'Tracto 6x4 · Capó aerodinámico',
  kind:'tractor', paint:0x1c1f24, grille:'fl', lampsOn:'cab', lampStyle:'conv', roofKit:'lights', engCover:0x2d3238, sleeper:true,
  conv:{y0:0.62, y1:1.85, rc:0.38, back:-0.95, engX0:0.8,
    front:[[0.62,1.42],[1.0,1.5],[1.35,1.42],[1.62,1.2],[1.85,0.75]], hw:[[0.62,1.24],[1.2,1.22],[1.6,1.05],[1.85,0.95]], rF:[[0.62,0.6],[1.3,0.55],[1.85,0.45]],
    grille:{u:0.9,y0:0.78,y1:1.5}, lamp:{u0:0.98,u1:1.75,y0:1.08,y1:1.4}},
  cab:{bottom:1.15, roof:3.95, rc:0.32, back:-3.35,
    front:[[1.15,-0.85],[1.9,-0.88],[2.0,-0.92],[2.85,-1.5],[3.2,-1.78],[3.95,-2.25]],
    hw:[[1.15,1.22],[2.0,1.24],[3.95,1.15]], rF:[[1.15,0.3],[2.0,0.35],[3.95,0.5]], rB:0.12,
    ws:[2.02,2.84], uWs:1.3, door:{x0:-2.85,y0:1.27,wy0:2.0}, bunkWin:null},
  R:0.52, track:1.04, axles:[{x:0,t:'steer'},{x:-5.1,t:'drive'},{x:-6.42,t:'drive'}], frameEnd:-7.4, fifth:-5.7,
  engine:{len:1.3,h:0.52,name:'Motor Detroit DD15',desc:'6 cilindros en línea de 14,8 litros con turbo y SCR. Unos 505 CV.'},
  gearbox:{name:'Caja Detroit DT12', desc:'Caja automatizada de 12 marchas con cambio predictivo según el relieve.'},
  cabName:'Cabina con dormitorio de techo alto', cabDesc:'Cabina aerodinámica con dormitorio integrado y techo alto inclinado, pensada para rutas largas.',
  specs:[['Motor','Detroit DD15 · 6 cil.'],['Cilindrada','14,8 l'],['Potencia','≈ 505 CV'],['Par máximo','≈ 2.500 Nm'],['Cambio','DT12 automatizada'],['Configuración','Tracto 6x4'],['Entre ejes','5,1 + 1,32 m'],['Alto total','≈ 4,0 m']]},

/* ---- Otras marcas de cabina sobre motor ---- */
{ id:'howo', brand:'Sinotruk', short:'HOWO', title:'Sinotruk HOWO 371', badge:'HOWO', sub:'Camión 6x4 volquete · Cabina corta',
  kind:'tipper', paint:0x2f5a3c, grille:'howo', lampsOn:'cab', lampStyle:'scania', roofKit:'visor', engCover:0x3a4148, sleeper:false,
  cab:{bottom:1.32, roof:3.35, rc:0.14, back:-0.75,
    front:[[1.32,1.42],[2.05,1.47],[2.85,1.36],[3.1,1.28],[3.35,1.18]], hw:[[1.32,1.22],[3.35,1.2]], rF:[[1.32,0.16],[3.35,0.2]], rB:0.08,
    ws:[2.1,2.85], uWs:1.4, door:{x0:-0.35,y0:1.44,wy0:2.06}, bunkWin:null, grille:{u:0.78,y0:1.5,y1:2.02}, lamp:{u0:0.84,u1:1.62,y0:1.42,y1:1.7}},
  R:0.52, track:1.04, axles:[{x:0,t:'steer'},{x:-3.8,t:'drive'},{x:-5.15,t:'drive'}], frameEnd:-6.4,
  engine:{len:1.1,h:0.5,name:'Motor Sinotruk WD615',desc:'6 cilindros en línea de 9,7 litros con turbo e intercooler. Da 371 CV, de ahí el nombre del modelo.'},
  gearbox:{name:'Caja HW19710', desc:'Caja manual de 10 marchas con reductora, robusta para obra y minería.'},
  cabName:'Cabina HOWO corta', cabDesc:'Cabina alta y plana de día, sin litera. Bascula hacia delante para acceder al motor.',
  specs:[['Motor','WD615 · 6 cil. en línea'],['Cilindrada','9,7 l'],['Potencia','371 CV'],['Par máximo','≈ 1.500 Nm'],['Cambio','HW19710 · 10 marchas'],['Configuración','Camión 6x4 volquete'],['Entre ejes','3,8 + 1,35 m'],['Alto total','≈ 3,35 m']]},

{ id:'hino', brand:'Hino', short:'500', title:'Hino 500', badge:'HINO 500', sub:'Camión 4x2 furgón · Cabina corta',
  kind:'box', paint:0x5d6f80, grille:'hino', lampsOn:'cab', lampStyle:'hino', roofKit:'deflector', defTop:3.35, boxTop:3.5, engCover:0x3a4148, sleeper:false,
  cab:{bottom:1.15, roof:2.75, rc:0.15, back:-0.4,
    front:[[1.15,1.38],[1.85,1.43],[2.5,1.34],[2.75,1.2]], hw:[[1.15,1.16],[2.75,1.13]], rF:[[1.15,0.2],[2.75,0.24]], rB:0.08,
    ws:[1.88,2.5], uWs:1.4, door:{x0:-0.25,y0:1.27,wy0:1.85}, bunkWin:null, grille:{u:0.72,y0:1.42,y1:1.8}, lamp:{u0:0.8,u1:1.62,y0:1.25,y1:1.52}},
  R:0.5, track:0.98, axles:[{x:0,t:'steer'},{x:-4.6,t:'drive'}], frameEnd:-6.8,
  engine:{len:1.0,h:0.44,name:'Motor Hino J08E',desc:'6 cilindros en línea de 7,7 litros con common rail. Alrededor de 260 CV.'},
  gearbox:{name:'Caja manual Hino', desc:'Caja manual de 9 marchas para reparto y distribución regional.'},
  cabName:'Cabina corta', cabDesc:'Cabina de día ancha con los faros en las esquinas. Bascula hacia delante para el mantenimiento.',
  specs:[['Motor','J08E · 6 cil. en línea'],['Cilindrada','7,7 l'],['Potencia','≈ 260 CV'],['Par máximo','≈ 794 Nm'],['Cambio','Manual 9 marchas'],['Configuración','Camión 4x2 furgón'],['Entre ejes','4,6 m'],['Alto total','≈ 3,5 m']]},

{ id:'isuzu', brand:'Isuzu', short:'NQR', title:'Isuzu NQR', badge:'NQR', sub:'Camión ligero 4x2 furgón',
  kind:'box', paint:0xe9ecef, grille:'isuzu', lampsOn:'cab', lampStyle:'vm', roofKit:'deflector', defTop:2.95, boxTop:3.1, boxW:2.1, engCover:0x3a4148, sleeper:false,
  wScale:0.8, frameDy:-0.2, bumperY0:0.4,
  cab:{bottom:0.95, roof:2.3, rc:0.14, back:-0.25,
    front:[[0.95,1.28],[1.6,1.32],[2.1,1.2],[2.3,1.1]], hw:[[0.95,1.0],[2.3,0.97]], rF:[[0.95,0.22],[2.3,0.26]], rB:0.07,
    ws:[1.62,2.12], uWs:1.4, door:{x0:-0.15,y0:1.05,wy0:1.6}, bunkWin:null, grille:{u:0.55,y0:1.08,y1:1.5}, lamp:{u0:0.62,u1:1.55,y0:1.06,y1:1.42}},
  R:0.4, track:0.82, axles:[{x:0,t:'steer'},{x:-3.35,t:'drive'}], frameEnd:-5.3,
  engine:{len:0.8,h:0.36,cyl:4,name:'Motor Isuzu 4HK1',desc:'4 cilindros en línea de 5,2 litros con common rail. Unos 190 CV.'},
  gearbox:{name:'Caja manual Isuzu', desc:'Caja manual de 6 marchas, ligera y fácil de mantener.'},
  cabName:'Cabina estrecha', cabDesc:'Cabina corta y estrecha de camión ligero, con el motor debajo. Pensada para reparto urbano.',
  specs:[['Motor','4HK1 · 4 cil. en línea'],['Cilindrada','5,2 l'],['Potencia','≈ 190 CV'],['Par máximo','≈ 510 Nm'],['Cambio','Manual 6 marchas'],['Configuración','Camión 4x2 furgón'],['Entre ejes','3,35 m'],['Alto total','≈ 3,1 m']]},

{ id:'atego', brand:'Mercedes-Benz', short:'Atego', title:'Mercedes-Benz Atego', badge:'ATEGO', sub:'Camión 4x2 baranda · Cabina corta',
  kind:'cargo', paint:0xe9ecef, grille:'mb', lampsOn:'bumper', lampStyle:'scania', roofKit:'visor', engCover:0x3a4148, sleeper:false,
  cab:{bottom:1.15, roof:2.75, rc:0.15, back:-0.45,
    front:[[1.15,1.38],[1.85,1.44],[2.5,1.35],[2.75,1.22]], hw:[[1.15,1.19],[2.75,1.16]], rF:[[1.15,0.2],[2.75,0.25]], rB:0.08,
    ws:[1.9,2.52], uWs:1.4, door:{x0:-0.3,y0:1.27,wy0:1.86}, bunkWin:null, grille:{u:0.7,y0:1.42,y1:1.84}},
  R:0.5, track:0.98, axles:[{x:0,t:'steer'},{x:-4.5,t:'drive'}], frameEnd:-6.9,
  engine:{len:1.0,h:0.44,name:'Motor Mercedes-Benz OM 936',desc:'6 cilindros en línea de 7,7 litros con common rail. Alrededor de 286 CV.'},
  gearbox:{name:'Caja manual Mercedes-Benz', desc:'Caja manual de 8 marchas; algunas versiones llevan cambio automatizado.'},
  cabName:'Cabina corta', cabDesc:'Cabina de día para distribución, con buena visibilidad y escalón bajo. Bascula hacia delante.',
  specs:[['Motor','OM 936 · 6 cil. en línea'],['Cilindrada','7,7 l'],['Potencia','≈ 286 CV'],['Par máximo','≈ 1.120 Nm'],['Cambio','Manual 8 marchas'],['Configuración','Camión 4x2 baranda'],['Entre ejes','4,5 m'],['Alto total','≈ 2,9 m']]},

/* ---- Carretas: se añaden al cargar en la versión original (id 'carreta-<tipo>') ---- */
{ id:'carreta-plataforma', brand:'Carreta', short:'Plataforma', title:'Plataforma', sub:'', kind:'trailer', ttype:'plataforma', paint:0x2b3036, specs:[] },
{ id:'carreta-furgon', brand:'Carreta', short:'Furgón', title:'Furgón', sub:'', kind:'trailer', ttype:'furgon', paint:0x2b3036, specs:[] },
{ id:'carreta-frio', brand:'Carreta', short:'Furgón frío', title:'Furgón frío', sub:'', kind:'trailer', ttype:'frio', paint:0x2b3036, specs:[] },
{ id:'carreta-cisterna', brand:'Carreta', short:'Cisterna', title:'Cisterna', sub:'', kind:'trailer', ttype:'cisterna', paint:0x2b3036, specs:[] },
{ id:'auto', brand:'Auto', short:'Auto', title:'Auto', sub:'Sedán · 2 ejes', kind:'car', paint:0x9aa3ab,
  car:{L:4.6, W:1.8, wb:2.7, R:0.33, y0:0.26, hb:0.62, cabL:2.25, cabW:1.56, cabH:0.56, cabX:-0.2},
  specs:[['Tipo','Auto (sedán)'],['Configuración','A2 · 2 ejes, 4 llantas'],['Largo','≈ 4,6 m'],['Ancho','≈ 1,8 m'],['Entre ejes','2,7 m']] },
{ id:'camioneta', brand:'Camioneta', short:'Camioneta', title:'Camioneta', sub:'SUV · 2 ejes', kind:'car', paint:0x2b3036,
  car:{L:4.9, W:1.95, wb:2.9, R:0.38, y0:0.34, hb:0.7, cabL:3.1, cabW:1.72, cabH:0.7, cabX:-0.45},
  specs:[['Tipo','Camioneta (SUV / pick-up)'],['Configuración','A2 · 2 ejes, 4 llantas'],['Largo','≈ 4,9 m'],['Ancho','≈ 1,95 m'],['Entre ejes','2,9 m']] },
{ id:'carreta-tolva', brand:'Carreta', short:'Tolva', title:'Tolva', sub:'', kind:'trailer', ttype:'tolva', paint:0x9e1b22, specs:[] },
];

/** Copia del modelo base con otro número de ejes o como otro tipo (tracto, volquete…). */
export function variant(base: ModeloDef, n: number, kind: string): ModeloDef {
  const M: ModeloDef = Object.assign({}, base, {kind: kind as ModeloDef['kind']});
  if (kind === 'tipper' && base.kind !== 'tipper') M.roofKit = 'visor';
  const ax = base.axles, over = base.frameEnd - ax[ax.length - 1].x;
  let nx = ax;
  if (n === 2 && ax.length === 3) nx = [ax[0], {x: ax[1].x, t: 'drive'}];
  if (n === 3 && ax.length === 2) nx = [ax[0], ax[1], {x: ax[1].x - 1.35, t: 'drive'}];
  M.axles = nx; M.frameEnd = nx[nx.length - 1].x + over;
  if (kind === 'tractor'){ const d = nx.slice(1); M.fifth = d.length > 1 ? (d[0].x + d[d.length - 1].x) / 2 + 0.07 : d[0].x + 0.2; }
  return M;
}

/** Id del modelo 3D base según marca y modelo del Excel. null si la marca no tiene modelo propio. */
export function truckBase(marca: string, modelo: string, tractor: boolean): string | null {
  if (/VOLVO/.test(marca)) return /\bFM/.test(modelo) ? 'fm' : /\bFH/.test(modelo) ? 'fh' : /\bVM/.test(modelo) ? 'vm' : tractor ? 'fh' : 'vm';
  if (/SCANIA/.test(marca)) return /^R/.test(modelo) ? 'r500' : 'p460';
  if (/INTERNATIONAL|NAVISTAR/.test(marca)) return /\bLT\b|PROSTAR|LONESTAR/.test(modelo) ? 'lt' : 'i7600';
  if (/FREIGHTLINER/.test(marca)) return 'cascadia';
  if (/\bDAF\b/.test(marca)) return 'xf';
  if (/SINOTRUK|HOWO|SITRAK/.test(marca)) return 'howo';
  if (/HINO/.test(marca)) return 'hino';
  if (/ISUZU/.test(marca)) return 'isuzu';
  if (/MERCEDES|BENZ|ATEGO|ACTROS/.test(marca)) return 'atego';
  return null;
}

export function modeloPorId(id: string): ModeloDef | undefined {
  return MODELS.find(m => m.id === id);
}
