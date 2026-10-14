// === media/notepadwords.js (<= 200 líneas): Motor de Ortografía y Sinónimos ===
window.TribalNotepadWords = (function () {
    'use strict';
    var LS_DICT = 'tribu_np_custom_dict_v1';
    var BASE_CORR = {
        tambien: 'también', cancion: 'canción', musica: 'música', facil: 'fácil',
        dificil: 'difícil', arbol: 'árbol', corazon: 'corazón', accion: 'acción',
        informacion: 'información', comunicacion: 'comunicación', edicion: 'edición',
        aplicacion: 'aplicación', telefono: 'teléfono', pagina: 'página',
        numero: 'número', ultimo: 'último', proximo: 'próximo', rapido: 'rápido',
        unico: 'único', publico: 'público', estabamos: 'estábamos', habia: 'había',
        tenia: 'tenía', podia: 'podía', queria: 'quería', sabia: 'sabía',
        ahi: 'ahí', aqui: 'aquí', asi: 'así', despues: 'después', ademas: 'además',
        atras: 'atrás', jamas: 'jamás', quizas: 'quizás', algun: 'algún',
        ningun: 'ningún', segun: 'según', comun: 'común', util: 'útil',
        inutil: 'inútil', debil: 'débil', fragil: 'frágil', exito: 'éxito',
        epoca: 'época', logica: 'lógica', fisica: 'física', quimica: 'química',
        imagenes: 'imágenes', jovenes: 'jóvenes', examenes: 'exámenes',
        arboles: 'árboles', pajaros: 'pájaros', sabado: 'sábado', miercoles: 'miércoles',
        dias: 'días', rio: 'río', frio: 'frío', mio: 'mío', tio: 'tío',
        pais: 'país', raiz: 'raíz', baul: 'baúl', oido: 'oído', caida: 'caída',
        cafe: 'café', sofa: 'sofá', mama: 'mamá', papa: 'papá', ojala: 'ojalá',
        perdon: 'perdón', razon: 'razón', pasion: 'pasión', mision: 'misión',
        vision: 'visión', union: 'unión', opcion: 'opción', funcion: 'función',
        solucion: 'solución', creacion: 'creación', oracion: 'oración',
        atencion: 'atención', direccion: 'dirección', coleccion: 'colección',
        conexion: 'conexión', expresion: 'expresión', emocion: 'emoción',
        sensacion: 'sensación', situacion: 'situación', relacion: 'relación',
        condicion: 'condición', posicion: 'posición', decision: 'decisión',
        television: 'televisión', avion: 'avión', camion: 'camión', rincon: 'rincón',
        salon: 'salón', balcon: 'balcón', jardin: 'jardín', almacen: 'almacén',
        interes: 'interés', estres: 'estrés', aereo: 'aéreo', linea: 'línea',
        heroe: 'héroe', oceano: 'océano', lagrima: 'lágrima', brujula: 'brújula',
        pelicula: 'película', capitulo: 'capítulo', titulo: 'título',
        articulo: 'artículo', vehiculo: 'vehículo', obstaculo: 'obstáculo',
        espectaculo: 'espectáculo', increible: 'increíble', egoista: 'egoísta',
        paraiso: 'paraíso', sonreir: 'sonreír', reir: 'reír', oir: 'oír',
        habito: 'hábito', credito: 'crédito', proposito: 'propósito',
        medico: 'médico', tecnico: 'técnico', practico: 'práctico', clasico: 'clásico',
        magico: 'mágico', basico: 'básico', fantastico: 'fantástico',
        historico: 'histórico', economico: 'económico', politico: 'político',
        artistico: 'artístico', cientifico: 'científico', matematico: 'matemático',
        automatico: 'automático', simpatico: 'simpático', problematico: 'problemático',
        haver: 'haber', haiga: 'haya', hiba: 'iba', llendo: 'yendo', valla: 'vaya', hacerce: 'hacerse', dijistes: 'dijiste', hicistes: 'hiciste',
        xq: 'porque', pq: 'porque', tb: 'también', tmb: 'también', q: 'que', habria: 'habría', podria: 'podría', tendria: 'tendría', seria: 'sería', diria: 'diría', haria: 'haría', deberia: 'debería', gustaria: 'gustaría'
    };

    var SYN_GROUPS = [
        ['bueno', 'excelente', 'óptimo', 'favorable', 'positivo', 'bondadoso', 'noble', 'genial', 'estupendo'],
        ['malo', 'pésimo', 'negativo', 'dañino', 'nocivo', 'adverso', 'deficiente', 'terrible', 'fatal'],
        ['grande', 'enorme', 'inmenso', 'vasto', 'amplio', 'gigante', 'colosal', 'extenso', 'mayor'],
        ['pequeño', 'diminuto', 'chico', 'reducido', 'mínimo', 'breve', 'escaso', 'menor', 'corto'],
        ['rápido', 'veloz', 'ágil', 'ligero', 'pronto', 'acelerado', 'raudo', 'inmediato', 'instantáneo'],
        ['lento', 'pausado', 'calmado', 'tardo', 'sosegado', 'tranquilo', 'despacio', 'gradual'],
        ['bonito', 'hermoso', 'bello', 'lindo', 'precioso', 'atractivo', 'espléndido', 'encantador', 'divino'],
        ['feo', 'desagradable', 'horrible', 'tosco', 'antiestético', 'espantoso', 'grotesco'],
        ['feliz', 'alegre', 'contento', 'dichoso', 'radiante', 'gozoso', 'entusiasmado', 'satisfecho'],
        ['triste', 'melancólico', 'apenado', 'afligido', 'abatido', 'nostálgico', 'deprimido', 'doliente'],
        ['fuerte', 'robusto', 'vigoroso', 'firme', 'resistente', 'poderoso', 'sólido', 'intenso', 'potente'],
        ['débil', 'frágil', 'endeble', 'vulnerable', 'delicado', 'flaco', 'flojo', 'agotado'],
        ['hablar', 'conversar', 'dialogar', 'platicar', 'charlar', 'expresar', 'comunicar', 'decir'],
        ['decir', 'expresar', 'manifestar', 'declarar', 'afirmar', 'pronunciar', 'mencionar', 'contar', 'relatar'],
        ['hacer', 'realizar', 'ejecutar', 'elaborar', 'efectuar', 'construir', 'producir', 'crear', 'fabricar'],
        ['crear', 'inventar', 'generar', 'fundar', 'concebir', 'forjar', 'diseñar', 'originar'],
        ['pensar', 'reflexionar', 'meditar', 'razonar', 'considerar', 'idear', 'imaginar', 'creer', 'opinar'],
        ['mirar', 'observar', 'contemplar', 'ver', 'divisar', 'examinar', 'avistar', 'notar', 'percibir'],
        ['caminar', 'andar', 'marchar', 'recorrer', 'transitar', 'pasear', 'avanzar', 'viajar', 'ir'],
        ['amar', 'querer', 'adorar', 'estimar', 'apreciar', 'venerar', 'afecto', 'cariño', 'amor'],
        ['casa', 'hogar', 'vivienda', 'morada', 'residencia', 'domicilio', 'refugio', 'edificio'],
        ['trabajo', 'labor', 'empleo', 'ocupación', 'tarea', 'oficio', 'faena', 'proyecto', 'obra'],
        ['amigo', 'compañero', 'camarada', 'aliado', 'colega', 'hermano', 'confidente', 'socio'],
        ['camino', 'sendero', 'ruta', 'vía', 'trayecto', 'vereda', 'rumbo', 'dirección', 'paso'],
        ['luz', 'claridad', 'resplandor', 'brillo', 'fulgor', 'luminosidad', 'destello', 'sol'],
        ['fuego', 'llama', 'hoguera', 'lumbre', 'incendio', 'brasa', 'ardor', 'calor'],
        ['tribu', 'comunidad', 'clan', 'pueblo', 'familia', 'hermandad', 'linaje', 'grupo', 'equipo'],
        ['música', 'melodía', 'armonía', 'canción', 'ritmo', 'sonido', 'canto', 'tema', 'pista'],
        ['historia', 'relato', 'crónica', 'narración', 'leyenda', 'cuento', 'memoria', 'anécdota'],
        ['libro', 'obra', 'volumen', 'texto', 'ejemplar', 'tomo', 'escrito', 'documento', 'manual'],
        ['nota', 'apunte', 'anotación', 'escrito', 'mensaje', 'registro', 'recordatorio', 'texto', 'carta'],
        ['idea', 'concepto', 'pensamiento', 'noción', 'ocurrencia', 'propuesta', 'plan', 'proyecto'],
        ['tiempo', 'época', 'periodo', 'etapa', 'momento', 'instante', 'era', 'plazo', 'hora'],
        ['agua', 'líquido', 'manantial', 'caudal', 'corriente', 'lluvia', 'rocío', 'mar', 'río'],
        ['tierra', 'suelo', 'terreno', 'mundo', 'planeta', 'territorio', 'patria', 'región', 'campo'],
        ['fuerza', 'energía', 'potencia', 'vigor', 'ímpetu', 'poder', 'fortaleza', 'ánimo'],
        ['paz', 'calma', 'serenidad', 'armonía', 'tranquilidad', 'sosiego', 'quietud', 'silencio'],
        ['miedo', 'temor', 'pavor', 'espanto', 'angustia', 'recelo', 'inquietud', 'susto'],
        ['valor', 'coraje', 'valentía', 'audacia', 'bravura', 'intrepidez', 'temple', 'mérito', 'precio'],
        ['dinero', 'capital', 'efectivo', 'moneda', 'riqueza', 'fortuna', 'fondos', 'plata', 'recursos'],
        ['ayuda', 'apoyo', 'auxilio', 'socorro', 'asistencia', 'colaboración', 'respaldo', 'favor'],
        ['buscar', 'indagar', 'explorar', 'investigar', 'rastrear', 'procurar', 'averiguar', 'consultar'],
        ['encontrar', 'hallar', 'descubrir', 'localizar', 'ubicar', 'topar', 'obtener', 'lograr'],
        ['cambiar', 'modificar', 'transformar', 'alterar', 'variar', 'renovar', 'reemplazar', 'sustituir'],
        ['mejorar', 'perfeccionar', 'optimizar', 'progresar', 'superar', 'pulir', 'avanzar', 'arreglar'],
        ['empezar', 'comenzar', 'iniciar', 'emprender', 'arrancar', 'inaugurar', 'abrir', 'principio'],
        ['terminar', 'finalizar', 'concluir', 'acabar', 'completar', 'culminar', 'cerrar', 'fin'],
        ['importante', 'esencial', 'fundamental', 'relevante', 'clave', 'vital', 'crucial', 'principal', 'notable'],
        ['fácil', 'sencillo', 'simple', 'elemental', 'accesible', 'claro', 'cómodo', 'práctico'],
        ['difícil', 'complejo', 'complicado', 'arduo', 'duro', 'laborioso', 'costoso', 'severo'],
        ['nuevo', 'reciente', 'moderno', 'fresco', 'actual', 'novedoso', 'inédito', 'joven'],
        ['viejo', 'antiguo', 'anciano', 'veterano', 'remoto', 'arcaico', 'usado', 'pasado'],
        ['escribir', 'redactar', 'anotar', 'apuntar', 'componer', 'plasmar', 'grabar'],
        ['leer', 'repasar', 'interpretar', 'descifrar', 'estudiar', 'ojear', 'revisar'],
        ['imagen', 'foto', 'fotografía', 'figura', 'ilustración', 'retrato', 'cuadro'],
        ['video', 'película', 'clip', 'grabación', 'filmación', 'cinta', 'escena']
    ];

    function getRules() { try { return JSON.parse(localStorage.getItem(LS_DICT) || '{}'); } catch (e) { return {}; } }
    function addRule(wrong, right) {
        var k = String(wrong || '').trim().toLowerCase(), v = String(right || '').trim();
        if (!k) return;
        var d = getRules(); d[k] = v || k;
        try { localStorage.setItem(LS_DICT, JSON.stringify(d)); } catch (e) {}
    }
    function removeRule(wrong) {
        var d = getRules(); delete d[String(wrong || '').trim().toLowerCase()];
        try { localStorage.setItem(LS_DICT, JSON.stringify(d)); } catch (e) {}
    }
    function matchCase(orig, rep) {
        if (!orig) return rep;
        if (orig === orig.toUpperCase() && orig.length > 1) return rep.toUpperCase();
        var c0 = orig.charAt(0);
        return (c0 === c0.toUpperCase() && c0 !== c0.toLowerCase()) ? rep.charAt(0).toUpperCase() + rep.slice(1) : rep;
    }
    function norm(s) { return String(s || '').toLowerCase().replace(/á/g, 'a').replace(/é/g, 'e').replace(/í/g, 'i').replace(/ó/g, 'o').replace(/ú/g, 'u').trim(); }

    function autocorrectWord(w) {
        var clean = String(w || '').toLowerCase();
        var custom = getRules(), ext = window.TribalNotepadDict && window.TribalNotepadDict.CORR;
        // Regla universal española: nv -> mb, np -> mp, nb -> mb (ej. tanbien -> también, inportante -> importante)
        var mpFix = clean.replace(/n([bp])/g, 'm$1').replace(/nv/g, 'mb');
        var hit = custom.hasOwnProperty(clean) ? custom[clean]
            : (BASE_CORR[clean] || (ext && ext[clean]) || BASE_CORR[mpFix] || (ext && ext[mpFix]));
        if (!hit && mpFix !== clean) hit = mpFix;
        if (!hit && clean.length > 4) {
            if (/([aeiouáéíóúctnsx])cion$/.test(mpFix)) hit = mpFix.slice(0, -4) + 'ción';
            else if (/([aeiouáéíóúns])sion$/.test(mpFix)) hit = mpFix.slice(0, -4) + 'sión';
            else if (/logia$/.test(mpFix)) hit = mpFix.slice(0, -5) + 'logía';
            else if (/grafia$/.test(mpFix)) hit = mpFix.slice(0, -6) + 'grafía';
            else if (/metria$/.test(mpFix)) hit = mpFix.slice(0, -6) + 'metría';
            else if (/isimo$/.test(mpFix)) hit = mpFix.slice(0, -5) + 'ísimo';
            else if (/isima$/.test(mpFix)) hit = mpFix.slice(0, -5) + 'ísima';
            else if (/abamos$/.test(mpFix)) hit = mpFix.slice(0, -6) + 'ábamos';
        }
        return hit ? matchCase(w, hit) : w;
    }

    function autocorrectText(t) {
        var count = 0;
        var res = String(t || '').replace(/[A-Za-zÁÉÍÓÚáéíóúñÑüÜ]+/g, function (w) {
            var fixed = autocorrectWord(w);
            if (fixed !== w) count++;
            return fixed;
        });
        return { text: res, count: count };
    }

    function inflectSyn(syn, fem, plur) {
        var s = syn;
        if (fem && /o$/.test(s)) s = s.slice(0, -1) + 'a';
        if (plur && !/s$/.test(s)) s = /[aeiouáéíóú]$/.test(s) ? s + 's' : s + 'es';
        return s;
    }

    function stemsOf(w) {
        var n = norm(w), arr = [n];
        if (n.length > 3) {
            if (/es$/.test(n)) arr.push(n.slice(0, -2), n.slice(0, -1));
            if (/s$/.test(n)) { var s1 = n.slice(0, -1); arr.push(s1); if (/a$/.test(s1)) arr.push(s1.slice(0, -1) + 'o'); }
            if (/a$/.test(n)) arr.push(n.slice(0, -1) + 'o');
            if (/ando$/.test(n)) arr.push(n.slice(0, -4) + 'ar');
            if (/iendo$/.test(n)) arr.push(n.slice(0, -5) + 'er', n.slice(0, -5) + 'ir');
            if (/(aba|aron|aste|amos)$/.test(n)) arr.push(n.replace(/(aba|aron|aste|amos)$/, 'ar'));
            if (/(ia|ieron|iste|imos)$/.test(n)) arr.push(n.replace(/(ia|ieron|iste|imos)$/, 'er'), n.replace(/(ia|ieron|iste|imos)$/, 'ir'));
        }
        return arr;
    }

    function synonymsFor(word) {
        var clean = String(word || '').replace(/[^A-Za-zÁÉÍÓÚáéíóúñÑüÜ]/g, '').trim(), w = clean.toLowerCase();
        if (!w) return Promise.resolve([]);
        var plur = /s$/.test(w) && w.length > 3;
        var fem = /as?$/.test(w) && w.length > 3;
        var stems = stemsOf(w), out = [], seen = {};
        seen[w] = 1; seen[norm(w)] = 1;
        var allGroups = SYN_GROUPS.concat((window.TribalNotepadDict && window.TribalNotepadDict.SYNS) || []);
        allGroups.forEach(function (grp) {
            var exact = grp.some(function (g) { var gn = norm(g); return g === w || stems.indexOf(gn) >= 0; });
            if (exact) grp.forEach(function (g) {
                var inf = inflectSyn(g, fem, plur), gn = norm(inf);
                if (!seen[inf] && !seen[gn]) { seen[inf] = 1; seen[gn] = 1; out.push(matchCase(clean, inf)); }
            });
        });
        return Promise.resolve(out.slice(0, 24));
    }

    return { autocorrectWord: autocorrectWord, autocorrectText: autocorrectText, synonymsFor: synonymsFor, getRules: getRules, addRule: addRule, removeRule: removeRule };
})();
