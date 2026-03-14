async function procesarGuardadoInspeccion() {
    const btn = document.getElementById('btnWizGuardar');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Procesando Evidencias...';

    let idInsp = document.getElementById('i_id_inspeccion').value || "INSP-" + Date.now();
    let fecha = document.getElementById('i_fecha').value;
    let placa = document.getElementById('i_placa').value.toUpperCase();
    let km = document.getElementById('i_kmtablero').value;
    let cliente = document.getElementById('i_cliente').value;
    let tecnico = document.getElementById('i_tecnico').value;
    let dias = document.getElementById('i_dias').value || "30";

    if(!placa || !tecnico) {
        alert("⚠️ La Placa y el Técnico son obligatorios.");
        btn.disabled = false; btn.innerHTML = 'Guardar Registro';
        return;
    }

    const fileToBase64 = (file) => new Promise((resolve, reject) => {
        const reader = new FileReader(); reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });

    let detalles = [];

    for (let i = 0; i < WIZARD_SCHEMA.length; i++) {
        let sec = WIZARD_SCHEMA[i];
        if(sec.items) {
            for (let j = 0; j < sec.items.length; j++) {
                let item = sec.items[j];
                let lbl = typeof item === 'string' ? item : item.label;
                let t = typeof item === 'string' ? 'okfalla' : item.type;
                let uid = `p_${i}_${j}`;
                let estado = "SIN DATOS", obs = "", fotoEvidencia = "";

                if(t === 'okfalla') {
                    let ok = document.getElementById(`${uid}_ok`);
                    let fa = document.getElementById(`${uid}_fa`);
                    if(ok && ok.dataset.chk === '1') estado = "OK";
                    if(fa && fa.dataset.chk === '1') {
                        estado = "FALLA";
                        let obsEl = document.getElementById(`obs_${uid}`);
                        if(obsEl) obs = obsEl.value;
                        let inputFoto = document.getElementById(`foto_${uid}`);
                        if(inputFoto && inputFoto.files && inputFoto.files.length > 0) {
                            try { fotoEvidencia = await fileToBase64(inputFoto.files[0]); }
                            catch(e) { console.log("Error foto", e); }
                        }
                    }
                } else if (t === 'percent') {
                    let val = document.getElementById(`val_${uid}`);
                    if(val && val.value) estado = val.value + "%";
                } else if (t === 'text') {
                    let txt = document.getElementById(`txt_${uid}`);
                    if(txt && txt.value) { estado = "REGISTRADO"; obs = txt.value; }
                }
                detalles.push({ categoria: sec.tab, item: lbl, estado: estado, observacion: obs, foto: fotoEvidencia });
            }
        }
    }

    let firmaData = (canvasFirma && ctxFirma) ? canvasFirma.toDataURL("image/png") : "";

    let datos = {
        form: {
            id: idInsp, fecha_ingreso: fecha, placa: placa, km_tablero: km, cliente: cliente, tecnico: tecnico, dias_propuestos: dias,
            detalles_json: JSON.stringify(detalles), firma_base64: firmaData, usuarioAutor: usuarioLogueado
        }
    };

    fetch('/api/script/guardarInspeccion', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datos)
    })
    .then(res => res.json())
    .then(r => {
        if(r.data === 'Éxito') {
            bootstrap.Modal.getInstance(document.getElementById('modalInspeccion')).hide();
            recargarModulo('statusMant');
        } else { alert("Error: " + r.data); }
        btn.disabled = false; btn.innerHTML = 'Guardar Registro';
    }).catch(e => { alert("Error de red: " + e.message); btn.disabled = false; btn.innerHTML = 'Guardar Registro'; });
}
