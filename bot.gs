var TELEGRAM_TOKEN = 'REPLACE_WITH_TELEGRAM_BOT_TOKEN';
var SHEET_NAME = 'Movimientos';
var CACHE_TTL_SECONDS = 120;

function doPost(e) {
  var ok = ContentService.createTextOutput('OK').setMimeType(ContentService.MimeType.TEXT);

  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ok;
    }

    var data;
    try {
      data = JSON.parse(e.postData.contents);
    } catch (parseError) {
      return ok;
    }

    var updateId = data && data.update_id;
    if (updateId === undefined || updateId === null) {
      return ok;
    }

    var cache = CacheService.getScriptCache();
    var cacheKey = 'tg_update_' + String(updateId);
    if (cache.get(cacheKey)) {
      return ok;
    }
    cache.put(cacheKey, '1', CACHE_TTL_SECONDS);

    procesarUpdate(data);
    return ok;
  } catch (err) {
    return ok;
  }
}

function procesarUpdate(data) {
  var message = data && data.message ? data.message : null;
  if (!message || !message.chat || message.chat.id === undefined || message.chat.id === null) {
    return;
  }

  var chatId = message.chat.id;
  var text = message.text;

  if (typeof text !== 'string' || !text.trim()) {
    enviarMensaje(chatId, '❌ Comando no reconocido\n\nUse:\nayuda');
    return;
  }

  var cleanText = sanitizarTexto(text);
  var parsed = parseCommand(cleanText);

  if (parsed.type === 'unknown') {
    enviarMensaje(chatId, '❌ Comando no reconocido\n\nUse:\nayuda');
    return;
  }

  if (parsed.type === 'command') {
    ejecutarComando(chatId, parsed.command);
    return;
  }

  if (parsed.type === 'movement') {
    var response = registrarMovimiento(parsed);
    enviarMensaje(chatId, response);
    return;
  }

  enviarMensaje(chatId, '❌ Comando no reconocido\n\nUse:\nayuda');
}

function parseCommand(rawText) {
  var text = sanitizarTexto(rawText).toLowerCase();
  var commands = {
    saldo: true,
    resumen: true,
    hoy: true,
    categorias: true,
    top: true,
    borrar: true,
    ayuda: true
  };

  if (commands[text]) {
    return { type: 'command', command: text };
  }

  var parts = text.split(' ');
  if (parts.length < 4) {
    return { type: 'unknown' };
  }

  var tipo = parts[0];
  if (tipo !== 'gasto' && tipo !== 'ingreso') {
    return { type: 'unknown' };
  }

  var valorRaw = parts[1].replace(/[^\d]/g, '');
  var valor = Number(valorRaw);
  var categoria = sanitizarTexto(parts[2]);
  var descripcion = sanitizarTexto(parts.slice(3).join(' '));

  if (!valorRaw || !isFinite(valor) || valor <= 0 || !categoria || !descripcion) {
    return { type: 'unknown' };
  }

  return {
    type: 'movement',
    movimiento: {
      tipo: tipo,
      valor: valor,
      categoria: categoria,
      descripcion: descripcion
    }
  };
}

function registrarMovimiento(parsed) {
  var sheet = getMovimientosSheet();
  var m = parsed.movimiento;

  sheet.appendRow([
    new Date(),
    m.tipo,
    m.categoria,
    m.valor,
    m.descripcion
  ]);

  return (
    '✅ Movimiento registrado\n\n' +
    'Tipo: ' + m.tipo + '\n' +
    'Categoría: ' + m.categoria + '\n' +
    'Valor: ' + formatCOP(m.valor) + '\n' +
    'Descripción: ' + m.descripcion
  );
}

function calcularSaldo() {
  var datos = obtenerMovimientos();
  var ingresos = 0;
  var gastos = 0;

  for (var i = 0; i < datos.length; i++) {
    var tipo = String(datos[i][1] || '').toLowerCase();
    var valor = Number(datos[i][3]) || 0;
    if (tipo === 'ingreso') ingresos += valor;
    if (tipo === 'gasto') gastos += valor;
  }

  return {
    ingresos: ingresos,
    gastos: gastos,
    saldo: ingresos - gastos
  };
}

function calcularResumen() {
  var datos = obtenerMovimientos();
  var ingresos = 0;
  var gastos = 0;

  for (var i = 0; i < datos.length; i++) {
    var tipo = String(datos[i][1] || '').toLowerCase();
    var valor = Number(datos[i][3]) || 0;
    if (tipo === 'ingreso') ingresos += valor;
    if (tipo === 'gasto') gastos += valor;
  }

  return {
    totalGastado: gastos,
    totalIngresos: ingresos,
    movimientos: datos.length
  };
}

function calcularPresupuestoDiario() {
  var saldoData = calcularSaldo();
  var hoy = new Date();
  var ultimoDiaMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
  var diaActual = hoy.getDate();
  var diasRestantes = ultimoDiaMes - diaActual;
  if (diasRestantes <= 0) diasRestantes = 1;

  return {
    saldo: saldoData.saldo,
    diasRestantes: diasRestantes,
    presupuestoDiario: saldoData.saldo / diasRestantes
  };
}

function calcularCategorias() {
  var datos = obtenerMovimientos();
  var categorias = {};

  for (var i = 0; i < datos.length; i++) {
    var tipo = String(datos[i][1] || '').toLowerCase();
    if (tipo !== 'gasto') continue;

    var categoria = String(datos[i][2] || 'sin_categoria').toLowerCase();
    var valor = Number(datos[i][3]) || 0;

    if (!categorias[categoria]) categorias[categoria] = 0;
    categorias[categoria] += valor;
  }

  return categorias;
}

function calcularTopCategorias() {
  var categorias = calcularCategorias();
  var arr = [];

  for (var key in categorias) {
    if (categorias.hasOwnProperty(key)) {
      arr.push({ categoria: key, total: categorias[key] });
    }
  }

  arr.sort(function (a, b) {
    return b.total - a.total;
  });

  return arr.slice(0, 3);
}

function borrarUltimoMovimiento() {
  var sheet = getMovimientosSheet();
  var lastRow = sheet.getLastRow();

  if (lastRow <= 1) {
    return 'No hay movimientos para borrar';
  }

  sheet.deleteRow(lastRow);
  return '🗑 Último movimiento eliminado';
}

function mostrarAyuda() {
  return (
    '🤖 Asistente financiero\n\n' +
    'Registrar gasto:\n' +
    'gasto 20000 comida almuerzo\n\n' +
    'Registrar ingreso:\n' +
    'ingreso 50000 trabajo diseño\n\n' +
    'Comandos disponibles:\n\n' +
    'saldo\n' +
    'resumen\n' +
    'hoy\n' +
    'categorias\n' +
    'top\n' +
    'borrar'
  );
}

function ejecutarComando(chatId, command) {
  if (command === 'saldo') {
    var saldo = calcularSaldo();
    enviarMensaje(
      chatId,
      '💰 Saldo actual\n────────────\n' +
      'Ingresos: ' + formatCOP(saldo.ingresos) + '\n' +
      'Gastos: ' + formatCOP(saldo.gastos) + '\n' +
      'Disponible: ' + formatCOP(saldo.saldo)
    );
    return;
  }

  if (command === 'resumen') {
    var resumen = calcularResumen();
    enviarMensaje(
      chatId,
      '📊 Resumen financiero\n────────────\n' +
      'Total gastado: ' + formatCOP(resumen.totalGastado) + '\n' +
      'Total ingresos: ' + formatCOP(resumen.totalIngresos) + '\n' +
      'Movimientos registrados: ' + resumen.movimientos
    );
    return;
  }

  if (command === 'hoy') {
    var diario = calcularPresupuestoDiario();
    enviarMensaje(
      chatId,
      '📅 Presupuesto diario\n────────────\n' +
      'Saldo disponible: ' + formatCOP(diario.saldo) + '\n' +
      'Días restantes: ' + diario.diasRestantes + '\n' +
      'Puedes gastar hoy: ' + formatCOP(diario.presupuestoDiario)
    );
    return;
  }

  if (command === 'categorias') {
    var categorias = calcularCategorias();
    var lines = ['📊 Gastos por categoría', '────────────'];
    var hasAny = false;

    for (var categoria in categorias) {
      if (categorias.hasOwnProperty(categoria)) {
        hasAny = true;
        lines.push(categoria + ': ' + formatCOP(categorias[categoria]));
      }
    }

    if (!hasAny) {
      lines.push('Sin gastos registrados');
    }

    enviarMensaje(chatId, lines.join('\n'));
    return;
  }

  if (command === 'top') {
    var top = calcularTopCategorias();
    var topLines = ['🏆 Top gastos', '────────────'];

    if (top.length === 0) {
      topLines.push('Sin gastos registrados');
    } else {
      for (var i = 0; i < top.length; i++) {
        topLines.push((i + 1) + '. ' + top[i].categoria + ': ' + formatCOP(top[i].total));
      }
    }

    enviarMensaje(chatId, topLines.join('\n'));
    return;
  }

  if (command === 'borrar') {
    enviarMensaje(chatId, borrarUltimoMovimiento());
    return;
  }

  if (command === 'ayuda') {
    enviarMensaje(chatId, mostrarAyuda());
    return;
  }

  enviarMensaje(chatId, '❌ Comando no reconocido\n\nUse:\nayuda');
}

function enviarMensaje(chatId, mensaje) {
  var token = TELEGRAM_TOKEN;
  if (!token || token === 'REPLACE_WITH_TELEGRAM_BOT_TOKEN') {
    return;
  }

  var url = 'https://api.telegram.org/bot' + token + '/sendMessage';
  var payload = {
    chat_id: chatId,
    text: mensaje
  };

  UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
}

function formatCOP(value) {
  var amount = Number(value) || 0;
  var rounded = Math.round(amount);
  var formatted = Utilities.formatString('%,d', rounded).replace(/,/g, '.');
  return 'COP: ' + formatted;
}

function getMovimientosSheet() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) {
    throw new Error('No existe la hoja "' + SHEET_NAME + '"');
  }
  return sheet;
}

function obtenerMovimientos() {
  var sheet = getMovimientosSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];

  return sheet.getRange(2, 1, lastRow - 1, 5).getValues();
}

function sanitizarTexto(texto) {
  return String(texto || '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
