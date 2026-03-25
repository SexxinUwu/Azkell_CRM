function doGet() {
  return HtmlService.createTemplateFromFile('Index').evaluate().setTitle('Azkell CRM').addMetaTag('viewport', 'width=device-width, initial-scale=1').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function include(filename) { return HtmlService.createHtmlOutputFromFile(filename).getContent(); }

function getFirestore() {
  var email = "firebase-adminsdk-fbsvc@crm-rosymar.iam.gserviceaccount.com";
  var key = "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC1B8TmRipEmJr+\nfFtvxlAdcWypZDmHCrh325fRKBdxS71Z7coBiDEQmBUHvLLu8ikBX6cWggZsNYZ+\nDim7YhBVxhX2zDyaXfcduoahOdllQ4ONfm1Sm6wav8rbKj6m4hrQvHHnpn/JlrIU\nihYHIfFhuF/Spe+lMN27fhbfnlbW27ShiPjcYKFKFV4ossLjqUFzYAE9foHjk1oK\ng0hHrAFY/1QZ8U8Um+V9Vz8GRzO8y4+HBqG/q+mTvPQjjblUIR20UCGUC1CfXVLA\n4HAITa4gcbhc7/lTJcxFCRNZwoxa+xT9nYLm+05JX/hjmQBlo76S8kw3KMgBjeAR\nYJzt0vy3AgMBAAECggEAF2E5fMPzEYjj+5nz9SuXjTXo4ree9mHcER67LLgQzwEJ\nI2QigrAkJhB+JtGoClQcF6FS4wVH7xG6nO0XVqwDkBBVJdqauRUJpT1BxfDCsuFV\nTCDX3aNdRtceS8/Y55SsAelUjKZkOpTLyvtKfQFVO1mkhoAHwz3cZSqTqa25aWYe\n1p8WUhDkoU+r+qYFW4P5tI0LvuRq5s/ln89d6s3zm+513WtfwuaLf06JSgcJe7t2\nI/jr41gttw7EI2GM8JzCPPfpbQNWfF+fkJHgIgowe2q6RMxnKSCfmEcgnsbQyw5r\nazwVbcdtcmBuQUHQtXRouA4Yfj+VTV/+YlDAKC2MAQKBgQDo7lgUDzdi3e+h5GXT\nD9OybNHaJGcyYpfP6k71/ZihlUJBZKTexjEJm14KxgA3uOPnJxK0XqXi+ERQvg1u\nZlbJZeLqUTClkA5FB7UALiZ7tEoEecEoPuq8QC/yoHp9DG3yiktsfXg8XOXdCpEn\nRiIM6ki4D0tjwM9d7zZXODBDIQKBgQDG9Y1q0NB7VMnezDmUUV/OKa2ZbcYynLlZ\nQe28cl3ylLwNBo/KXq4shbkQqj+eiFpK/joaA4BttTnfVs+l17hWbosGuBBHYOiV\nN+qRm+XKNSG5OZrbEwcEnokCiplflTqrmFtDHpj9yTbSORbKYp5NG6HRucSai5fs\nC3JNqpMc1wKBgQCXOxgoffCh2iJZY+bQb/gsYgalsPjnd6fFMAVwJORSFIxd1LBO\nizMPX7ZhHEjL5NjjHTVBsinWAQapvZsO0JcMT4BSTcBd3ffFzckwgsYtjtJ3sW09\nagwRiUMYLiUYx1cjH7L0j0nfNxluuAuiCiDVbc8k4Zk6/NYl0MfhPPPowQKBgEII\nR0o3SapVJra6QzX1l/19ma89XrV3jJCSMAwGTSXwtUUBc4Gv0NDYBOcCCiFckdMn\n8zKlDN/ccPut/TbGlNii0aOGPWjjQe4cY8611hs5bRrjgoDJHOAsmb5tL6AokBNZ\nepiZNB+uw3IcHnNHLdDbpeZMaHL+d4qQ9fvO7Ap7AoGBAJ6gd4benrFr5aC0PJSk\nXrUWdVgWyBdzqWYaFZaGgagZV2CeQnVGWClWW4/kmO5Rq2n5w2CvJdCUzx42kB3z\nR4YyLQ1N8UG8bB5bLRQwC8gfri+Y/YGzBOgsq+pe3wy7ROr70pnYy8Hlb6ik2+d9\nPLomlYs6/NwMfitxKTkb+dcf\n-----END PRIVATE KEY-----\n";
  var projectId = "crm-rosymar";
  return FirestoreApp.getFirestore(email, key, projectId);
}

function obtenerValor(c) { 
  if(!c) return "";
  if(typeof c === 'object') {
    if(c.stringValue !== undefined) return c.stringValue;
    if(c.integerValue !== undefined) return c.integerValue;
    if(c.doubleValue !== undefined) return c.doubleValue;
    if(c.booleanValue !== undefined) return c.booleanValue;
  }
  return c.toString();
}

function registrarAuditoria(u, a, d) { try { var f = getFirestore(); var id = "AUD-" + new Date().getTime(); f.createDocument("Auditoria/"+id, { idAuditoria: id, fecha: new Date().toLocaleString('es-PE'), usuario: u || "Sistema", accion: a, detalle: d, timestamp: new Date().getTime() }); } catch(e) {} }
function eliminarDocumento(id, col, u) { try { getFirestore().deleteDocument(col+"/"+id); registrarAuditoria(u, "ELIMINÓ", "Registro " + id + " eliminado de " + col); return "Éxito"; } catch(e) { return "Error: " + e; } }

function validarLogin(correo, password) { try { var docs = getFirestore().getDocuments("Usuarios"); var c = correo.toString().trim().toLowerCase(); for (var i=0; i<docs.length; i++) { var u=docs[i].fields; if (u && u.correo && obtenerValor(u.correo).trim().toLowerCase()===c) { if(obtenerValor(u.password).trim()===password.toString().trim()){ if(obtenerValor(u.estado)==="Inactivo") return {exito:false, mensaje:"Cuenta inactiva."}; return {exito:true, nombre:obtenerValor(u.nombre), rol:obtenerValor(u.rol)}; } else { return {exito:false, mensaje:"Contraseña incorrecta."}; } } } return {exito:false, mensaje:"El correo no está registrado."}; } catch(e) { return {exito:false, mensaje:"Error DB: "+e}; } }
function obtenerDatosAuditoria() { try { var docs = getFirestore().getDocuments("Auditoria"); var d=[]; for(var i=0; i<docs.length; i++){ var f=docs[i].fields; if(f) d.push([obtenerValor(f.fecha), obtenerValor(f.usuario), obtenerValor(f.accion), obtenerValor(f.detalle), obtenerValor(f.timestamp)]); } d.sort((a,b)=>b[4]-a[4]); return d; } catch(e) { return "ERROR_BACKEND: "+e; } }
function obtenerDatosUsuarios() { try { var docs = getFirestore().getDocuments("Usuarios"); var d=[]; for(var i=0; i<docs.length; i++){ var f=docs[i].fields; if(f) d.push([obtenerValor(f.idUsuario), obtenerValor(f.nombre), obtenerValor(f.cargo), obtenerValor(f.correo), obtenerValor(f.rol), obtenerValor(f.estado), obtenerValor(f.password)]); } return d; } catch(e) { return "ERROR_BACKEND: "+e; } }
function obtenerDatosSeguridad() { try { var docs = getFirestore().getDocuments("Seguridad"); var d=[]; for(var i=0; i<docs.length; i++){ var f=docs[i].fields; if(f) d.push([obtenerValor(f.idReporte), obtenerValor(f.fecha), obtenerValor(f.inspector), obtenerValor(f.tipo), obtenerValor(f.detalle), obtenerValor(f.urlImagen), obtenerValor(f.estado)]); } d.sort((a,b)=>b[0].localeCompare(a[0])); return d; } catch(e) { return "ERROR_BACKEND: "+e; } }

function guardarUsuario(form) { try { var f=getFirestore(); var d=f.getDocuments("Usuarios"); var max=1000; for(var i=0; i<d.length; i++){ var id=obtenerValor(d[i].fields.idUsuario); if(id && id.indexOf("-")>-1){ var n=parseInt(id.split("-")[1]); if(!isNaN(n) && n>max) max=n; } } var idN="USR-"+(max+1); f.createDocument("Usuarios/"+idN, {idUsuario:idN, nombre:form.nombreUsuario, cargo:form.cargoUsuario, correo:form.correoUsuario, rol:form.rolUsuario, estado:form.estadoUsuario, password:form.passwordUsuario}); return "Éxito"; } catch(e) { return "Error: "+e; } }
function actualizarUsuario(form) { try { var f=getFirestore(); var id=form.idUsuarioEdit; f.updateDocument("Usuarios/"+id, {idUsuario:id, nombre:form.nombreUsuarioEdit, cargo:form.cargoUsuarioEdit, correo:form.correoUsuarioEdit, rol:form.rolUsuarioEdit, estado:form.estadoUsuarioEdit, password:form.passwordUsuarioEdit}); return "Éxito"; } catch(e) { return "Error: "+e; } }
function guardarReporte(form) { try { var f=getFirestore(); var url=""; if(form.fotoIncidente && typeof form.fotoIncidente==='object' && form.fotoIncidente.getName && form.fotoIncidente.getName()!==""){ url=DriveApp.getFolderById("1eQp6Jo2hQ9UFHiLjSQm01_qEeRra7Mzn").createFile(form.fotoIncidente).getUrl(); } var d=f.getDocuments("Seguridad"); var max=1000; for(var i=0; i<d.length; i++){ var id=obtenerValor(d[i].fields.idReporte); if(id && id.indexOf("-")>-1){ var n=parseInt(id.split("-")[1]); if(!isNaN(n) && n>max) max=n; } } var idN="SEG-"+(max+1); f.createDocument("Seguridad/"+idN, {idReporte:idN, fecha:new Date().toLocaleString('es-PE'), inspector:form.inspector, tipo:form.tipoIncidente, detalle:form.detalle, urlImagen:url, estado:"Pendiente"}); return "Éxito"; } catch(e) { return "Error: "+e; } }
function actualizarReporte(form) { try { var f=getFirestore(); var id=form.idReporte; var doc=f.getDocument("Seguridad/"+id).fields; var url=obtenerValor(doc.urlImagen); if(form.fotoEdit && typeof form.fotoEdit==='object' && form.fotoEdit.getName && form.fotoEdit.getName()!==""){ url=DriveApp.getFolderById("1eQp6Jo2hQ9UFHiLjSQm01_qEeRra7Mzn").createFile(form.fotoEdit).getUrl(); } else if(form.eliminarFoto==="si") url=""; f.updateDocument("Seguridad/"+id, {inspector:form.inspectorEdit, tipo:form.tipoIncidenteEdit, estado:form.estadoEdit, urlImagen:url, idReporte:id, fecha:obtenerValor(doc.fecha), detalle:obtenerValor(doc.detalle)}); return "Éxito"; } catch(e) { return "Error: "+e; } }

function obtenerDatosPlacas() { try { var docs = getFirestore().getDocuments("Placas"); var datos = []; for (var i = 0; i < docs.length; i++) { if (!docs[i].fields) continue; var f = docs[i].fields; datos.push([ obtenerValor(f.placa), obtenerValor(f.cliente), obtenerValor(f.tipo), obtenerValor(f.modelo_uts), obtenerValor(f.marca), obtenerValor(f.ruc_dni), obtenerValor(f.configuracion), obtenerValor(f.combustible), obtenerValor(f.estado), obtenerValor(f.operativo), obtenerValor(f.uts), obtenerValor(f.motora), obtenerValor(f.llantas), obtenerValor(f.en_uso) ]); } return datos; } catch (error) { return "ERROR_BACKEND: " + error.toString(); } }
function guardarPlaca(f) { try { var firestore = getFirestore(); var idPlaca = f.p_placa.toString().toUpperCase().trim(); firestore.createDocument("Placas/" + idPlaca, { placa: idPlaca, cliente: f.p_cliente, tipo: f.p_tipo, modelo_uts: f.p_modelo, marca: f.p_marca, ruc_dni: f.p_ruc, configuracion: f.p_conf, combustible: f.p_comb, estado: f.p_estado, operativo: f.p_operativo, uts: f.p_uts, motora: f.p_motora, llantas: f.p_llantas, en_uso: f.p_enuso }); return "Éxito"; } catch (e) { return "Error al guardar."; } }
function actualizarPlaca(f) { try { var firestore = getFirestore(); var idPlaca = f.editP_placa.toString().toUpperCase().trim(); firestore.updateDocument("Placas/" + idPlaca, { placa: idPlaca, cliente: f.editP_cliente, tipo: f.editP_tipo, modelo_uts: f.editP_modelo, marca: f.editP_marca, ruc_dni: f.editP_ruc, configuracion: f.editP_conf, combustible: f.editP_comb, estado: f.editP_estado, operativo: f.editP_operativo, uts: f.editP_uts, motora: f.editP_motora, llantas: f.editP_llantas, en_uso: f.editP_enuso }); return "Éxito"; } catch (e) { return "Error: " + e.toString(); } }

function obtenerTiposMantenimiento() { try { var docs = getFirestore().getDocuments("Tipos_Mantenimiento"); var datos = []; for (var i = 0; i < docs.length; i++) { if (!docs[i].fields) continue; var f = docs[i].fields; datos.push({ marca: obtenerValor(f.marca), tipo_mp: obtenerValor(f.tipo_mp), uts: obtenerValor(f.uts), frecuencia_km: obtenerValor(f.frecuencia_km) }); } return datos; } catch (e) { return []; } }
function obtenerTPMP() { try { var docs = getFirestore().getDocuments("TP_MP"); var datos = []; for (var i = 0; i < docs.length; i++) { if (!docs[i].fields) continue; var f = docs[i].fields; datos.push(obtenerValor(f.tipo_mant)); } return datos; } catch (e) { return []; } }

function obtenerDatosFleetrun() { try { var docs = getFirestore().getDocuments("Fleetrun"); var datos = []; for (var i = 0; i < docs.length; i++) { if (!docs[i].fields) continue; var f = docs[i].fields; datos.push([ obtenerValor(f.idRegistro), obtenerValor(f.fecha), obtenerValor(f.mes), obtenerValor(f.anio), obtenerValor(f.placa), obtenerValor(f.marca), obtenerValor(f.dueno), obtenerValor(f.uts), obtenerValor(f.tipo_mp), obtenerValor(f.km_actual), obtenerValor(f.frecuencia_km), obtenerValor(f.km_proximo), obtenerValor(f.observacion), obtenerValor(f.tecnico), obtenerValor(f.km_gps) ]); } return datos; } catch (error) { return "ERROR_BACKEND: " + error.toString(); } }
function guardarFleetrun(f) { try { var firestore = getFirestore(); var idRegistro = (f.f_id && f.f_id.trim() !== "") ? f.f_id.toString().toUpperCase().trim() : "FL-" + Date.now(); firestore.createDocument("Fleetrun/" + idRegistro, { idRegistro: idRegistro, fecha: f.f_fecha, mes: f.f_mes, anio: f.f_anio, placa: f.f_placa, marca: f.f_marca, dueno: f.f_dueno, uts: f.f_uts, tipo_mp: f.f_tipomp, km_actual: f.f_kmact, frecuencia_km: f.f_freckm, km_proximo: f.f_kmprox, observacion: f.f_obs, tecnico: f.f_tec, km_gps: f.f_kmgps || "0" }); return "Éxito"; } catch (e) { return "Error al guardar."; } }
function actualizarFleetrun(f) { try { var firestore = getFirestore(); var idRegistro = f.editF_id.toString().toUpperCase().trim(); firestore.updateDocument("Fleetrun/" + idRegistro, { idRegistro: idRegistro, fecha: f.editF_fecha, mes: f.editF_mes, anio: f.editF_anio, placa: f.editF_placa, marca: f.editF_marca, dueno: f.editF_dueno, uts: f.editF_uts, tipo_mp: f.editF_tipomp, km_actual: f.editF_kmact, frecuencia_km: f.editF_freckm, km_proximo: f.editF_kmprox, observacion: f.editF_obs, tecnico: f.editF_tec, km_gps: f.editF_kmgps || "0" }); return "Éxito"; } catch (e) { return "Error: " + e.toString(); } }

function obtenerDatosInspecciones() {
  try {
    var docs = getFirestore().getDocuments("Inspecciones");
    var datos = [];
    for (var i = 0; i < docs.length; i++) {
      if (!docs[i].fields) continue;
      var f = docs[i].fields;
      var row = {};
      
      for(var key in f) { row[key.toUpperCase()] = obtenerValor(f[key]); }
      
      row.id = row["ID"] || row["REGISTRO"] || ("INSP-" + i);
      row.placa = row["PLACA"] || "";
      row.fecha_ingreso = row["FECHA_DE_INGRESO"] || "";
      row.dias_propuestos = row["DIAS_PROPUESTOS"] || "30";
      row.tecnico = row["TECNICO"] || "";
      row.cliente = row["CLIENTE"] || "";
      row.km_tablero = row["KM_TABLERO"] || "";
      row.url_firma = row["URL_FIRMA"] || "";
      row.detalles_json = row["DETALLES_JSON"] || ""; 
      
      datos.push(row);
    }
    return datos;
  } catch (error) { return "ERROR_BACKEND: " + error.toString(); }
}

function obtenerImagenBase64(url) { 
  try { 
      var idMatch = url.match(/[-\w]{25,}/); 
      if (!idMatch) return null; 
      var file = DriveApp.getFileById(idMatch[0]);
      return "data:" + file.getBlob().getContentType() + ";base64," + Utilities.base64Encode(file.getBlob().getBytes()); 
  } catch (error) { return null; } 
}

function guardarInspeccionMecanica(datos) {
  try {
    var f = getFirestore();
    var urlFirma = "";
    
    if (datos.firmaBase64 && datos.firmaBase64 !== "") {
      var splitBase = datos.firmaBase64.split(',');
      var tipoArchivo = splitBase[0].match(/:(.*?);/)[1];
      var blob = Utilities.newBlob(Utilities.base64Decode(splitBase[1]), tipoArchivo, "Firma_" + datos.placa + "_" + new Date().getTime() + ".png");
      urlFirma = DriveApp.getFolderById("1eQp6Jo2hQ9UFHiLjSQm01_qEeRra7Mzn").createFile(blob).getUrl();
    }
    
    var docs = f.getDocuments("Inspecciones");
    var max = 1000;
    for (var i = 0; i < docs.length; i++) {
      var idDoc = obtenerValor(docs[i].fields.ID);
      if (idDoc && idDoc.indexOf("-") > -1) {
        var num = parseInt(idDoc.split("-")[1]);
        if (!isNaN(num) && num > max) max = num;
      }
    }
    var nuevoID = "INSP-" + (max + 1);
    
    f.createDocument("Inspecciones/" + nuevoID, {
      ID: nuevoID, FECHA_DE_INGRESO: datos.fecha, PLACA: datos.placa.toUpperCase(), KM_TABLERO: datos.kmTablero,
      CLIENTE: datos.cliente, TECNICO: datos.tecnico, DIAS_PROPUESTOS: datos.dias, URL_FIRMA: urlFirma,
      ESTADO: "Completado", DETALLES_JSON: datos.detallesJSON 
    });
    
    registrarAuditoria(datos.usuarioAutor, "CREÓ", "Inspección: " + datos.placa.toUpperCase());
    return "Éxito";
  } catch(e) { return "Error al guardar: " + e.toString(); }
}

function actualizarInspeccionMecanica(datos) {
  try {
    var f = getFirestore();
    var updateData = {
      FECHA_DE_INGRESO: datos.fecha, PLACA: datos.placa.toUpperCase(), KM_TABLERO: datos.kmTablero,
      CLIENTE: datos.cliente, TECNICO: datos.tecnico, DIAS_PROPUESTOS: datos.dias,
      ESTADO: "Completado", DETALLES_JSON: datos.detallesJSON
    };
    
    if (datos.firmaBase64 && datos.firmaBase64 !== "") {
      var splitBase = datos.firmaBase64.split(',');
      var tipoArchivo = splitBase[0].match(/:(.*?);/)[1];
      var blob = Utilities.newBlob(Utilities.base64Decode(splitBase[1]), tipoArchivo, "Firma_" + datos.placa + "_" + new Date().getTime() + ".png");
      updateData.URL_FIRMA = DriveApp.getFolderById("1eQp6Jo2hQ9UFHiLjSQm01_qEeRra7Mzn").createFile(blob).getUrl();
    }
    
    f.updateDocument("Inspecciones/" + datos.idInspeccion, updateData);
    registrarAuditoria(datos.usuarioAutor, "MODIFICÓ", "Actualizó Inspección: " + datos.idInspeccion);
    return "Éxito";
  } catch(e) { return "Error al actualizar: " + e.toString(); }
}

function consultarGemini(pregunta, datosTabla) { try { var apiKey = "AIzaSyAOloEWep_cl3_5fwfJdLJqE1elj_Kd_qU"; var url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + apiKey; var payload = { "contents": [{ "parts": [{ "text": "Eres el asistente experto de AZKELL. Datos:\n" + JSON.stringify(datosTabla) + "\nResponde breve a: " + pregunta }] }] }; var json = JSON.parse(UrlFetchApp.fetch(url, { "method": "post", "contentType": "application/json", "payload": JSON.stringify(payload), "muteHttpExceptions": true }).getContentText()); return json.error ? "Error IA: " + json.error.message : json.candidates[0].content.parts[0].text; } catch (e) { return "Error IA: " + e.toString(); } }

// =========================================================================
// 🔥 CONEXIÓN API DE WIALON (CORREGIDO Y OPTIMIZADO) 🔥
// =========================================================================
function obtenerDatosWialon() {
  try {
    var token = "b0a4947147e59c66f42703bca5df48a1B33E01E58063AD32AF788F04F09F24F4F88692AC";
    var baseUrl = "https://hst-api.wialon.us/wialon/ajax.html";
    
    // 1. Iniciar sesión y obtener SID
    var loginUrl = baseUrl + "?svc=token/login&params=" + encodeURIComponent(JSON.stringify({"token": token}));
    var responseLogin = UrlFetchApp.fetch(loginUrl, {muteHttpExceptions: true});
    var dataLogin = JSON.parse(responseLogin.getContentText());
    
    if (!dataLogin.eid) { return {error: "Fallo Login Wialon."}; }
    var sid = dataLogin.eid;
    
    // 2. Extraer datos en tiempo real (Coordenadas, KMs y Horas Motor)
    var searchParams = {
      "spec": { "itemsType": "avl_unit", "propName": "sys_name", "propValueMask": "*", "sortType": "sys_last_message" },
      "force": 1, "flags": 9221, "from": 0, "to": 0
    };
    
    var searchUrl = baseUrl + "?svc=core/search_items&params=" + encodeURIComponent(JSON.stringify(searchParams)) + "&sid=" + sid;
    var responseSearch = UrlFetchApp.fetch(searchUrl, {muteHttpExceptions: true});
    var dataSearch = JSON.parse(responseSearch.getContentText());
    
    if (!dataSearch.items) { return {error: "No se encontró data de unidades en Wialon."}; }
    
    // 3. Procesar y mapear la respuesta para el Front-End
    var vehiculosLive = [];
    for (var i = 0; i < dataSearch.items.length; i++) {
      var item = dataSearch.items[i];
      var rawName = item.nm ? item.nm.toUpperCase().trim() : "";
      
      // Inteligencia para extraer solo la placa (Ej: "CFB784 (Scania)" -> "CFB784")
      var placaLimpia = rawName;
      var matchPlaca = rawName.match(/[A-Z0-9]{5,}/); // Busca el primer bloque de al menos 5 letras/números seguidos
      if (matchPlaca) placaLimpia = matchPlaca[0];

      if (rawName) {
        vehiculosLive.push({
          nombre_wialon: rawName,
          placa: placaLimpia,
          km: item.cnm_km ? Math.round(item.cnm_km) : 0,
          horas: item.cneh ? Math.round(item.cneh) : 0,
          lat: item.pos ? item.pos.y : 0,
          lng: item.pos ? item.pos.x : 0
        });
      }
    }
    
    // 4. Cerrar sesión (Con la URL codificada correctamente)
    UrlFetchApp.fetch(baseUrl + "?svc=core/logout&params=%7B%7D&sid=" + sid, {muteHttpExceptions: true});
    
    return vehiculosLive;
    
  } catch (e) {
    return {error: e.toString()};
  }
}