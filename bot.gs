var token = "8687553336:AAGKVOTDfCKDO2qM8QX7vajucrj5zhH70tg";
var SHEET_NAME = "Movimientos";
var COMMANDS = {
  saldo: true,
  resumen: true,
  hoy: true,
  categorias: true,
  top: true,
  borrar: true,
  ayuda: true
};

function doPost(e) {
  try {
    var data = extraerPayloadSeguro(e);
    if (!data || !data.message) {
      return respuestaOk();
    }

    var chatId = data.message.chat && data.message.chat.id;
    var originalText = data.message.text;

    if (!chatId || typeof originalText !== "string") {
      return respuestaOk();
    }

    var text = sanitizarTexto(originalText);
    if (!text) {
      enviarMensaje(chatId, "❌ Mensaje vacío. Usa 'ayuda' para ver ejemplos.");
      return respuestaOk();
    }

    var comando = parseCommand(text);
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);

    if (!sheet) {
      enviarMensaje(chatId, "❌ No se encontró la hoja 'Movimientos'.");
      return respuestaOk();
    }

    // Comandos explícitos
    if (comando) {
      manejarComando(comando, sheet, chatId);
      return respuestaOk();
    }

    // Registro de movimientos (solo gasto/ingreso)
    var resultadoRegistro = registrarMovimiento(text, sheet);
    enviarMensaje(chatId, resultadoRegistro.mensaje);

    return respuestaOk();
  } catch (error) {
    try {
      var fallbackData = extraerPayloadSeguro(e);
      var fallbackChatId = fallbackData && fallbackData.message && fallbackData.message.chat && fallbackData.message.chat.id;
      if (fallbackChatId) {
        enviarMensaje(fallbackChatId, "❌ Ocurrió un error al procesar el mensaje. Intenta de nuevo.");
      }
    } catch (ignore) {}

    return respuestaOk();
  }
}

function parseCommand(text) {
  var comando = String(text || "").trim().toLowerCase();
  return COMMANDS[comando] ? comando : null;
}

function registrarMovimiento(text, sheet) {
  var partes = sanitizarTexto(text).split(" ");

  if (partes.length < 4) {
    return {
      ok: false,
      mensaje: "❌ Formato inválido. Usa: tipo valor categoria descripcion"
    };
  }

  var tipo = partes[0];
  if (tipo !== "gasto" && tipo !== "ingreso") {
    return {
      ok: false,
      mensaje: "❌ Comando no reconocido. Usa 'ayuda' para ver opciones."
    };
  }

  var valor = normalizarNumero(partes[1]);
  if (!esNumeroValido(valor) || valor <= 0) {
    return {
      ok: false,
      mensaje: "❌ El valor debe ser numérico y mayor a 0."
    };
  }

  var categoria = sanitizarCampo(partes[2], 50);
  var descripcion = sanitizarCampo(partes.slice(3).join(" "), 200);

  if (!categoria || !descripcion) {
    return {
      ok: false,
      mensaje: "❌ Debes incluir categoría y descripción."
    };
  }

  var data = obtenerDatos(sheet);

  // Alerta de sobre-gasto (solo para gastos)
  if (tipo === "gasto") {
    var presupuesto = calcularPresupuestoDiario(data);
    if (valor > presupuesto.presupuestoDiario) {
      sheet.appendRow([new Date(), tipo, categoria, valor, descripcion]);
      return {
        ok: true,
        mensaje:
          "⚠️ Atención\n\n" +
          "Este gasto supera tu presupuesto diario recomendado.\n\n" +
          "Presupuesto hoy: " + formatearNumero(presupuesto.presupuestoDiario) + "\n" +
          "Gasto realizado: " + formatearNumero(valor)
      };
    }
  }

  sheet.appendRow([new Date(), tipo, categoria, valor, descripcion]);
  return { ok: true, mensaje: "✅ Movimiento registrado" };
}

function calcularSaldo(data) {
  var ingresos = 0;
  var gastos = 0;

  for (var i = 1; i < data.length; i++) {
    var tipo = String(data[i][1] || "").toLowerCase();
    var valor = normalizarNumero(data[i][3]);
    if (!esNumeroValido(valor)) {
      continue;
    }

    if (tipo === "ingreso") ingresos += valor;
    if (tipo === "gasto") gastos += valor;
  }

  return {
    ingresos: ingresos,
    gastos: gastos,
    saldo: ingresos - gastos
  };
}

function calcularResumen(data) {
  var saldo = calcularSaldo(data);
  var movimientos = Math.max(data.length - 1, 0);

  return {
    totalGastado: saldo.gastos,
    totalIngresos: saldo.ingresos,
    movimientos: movimientos
  };
}

function calcularPresupuestoDiario(data) {
  var saldoData = calcularSaldo(data);
  var hoy = new Date();
  var ultimoDiaMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
  var diasRestantes = ultimoDiaMes - hoy.getDate();

  if (diasRestantes <= 0) diasRestantes = 1;

  return {
    saldo: saldoData.saldo,
    diasRestantes: diasRestantes,
    presupuestoDiario: saldoData.saldo / diasRestantes
  };
}

function calcularCategorias(data) {
  var categorias = {};

  for (var i = 1; i < data.length; i++) {
    var tipo = String(data[i][1] || "").toLowerCase();
    if (tipo !== "gasto") continue;

    var categoria = sanitizarCampo(data[i][2], 50) || "sin_categoria";
    var valor = normalizarNumero(data[i][3]);
    if (!esNumeroValido(valor)) continue;

    categorias[categoria] = (categorias[categoria] || 0) + valor;
  }

  return categorias;
}

function calcularTopCategorias(data) {
  var categorias = calcularCategorias(data);
  var lista = [];

  for (var nombre in categorias) {
    if (categorias.hasOwnProperty(nombre)) {
      lista.push({ categoria: nombre, total: categorias[nombre] });
    }
  }

  lista.sort(function (a, b) {
    return b.total - a.total;
  });

  return lista.slice(0, 3);
}

function borrarUltimoMovimiento(sheet) {
  var ultimaFila = sheet.getLastRow();
  if (ultimaFila <= 1) {
    return "No hay movimientos para borrar";
  }
  sheet.deleteRow(ultimaFila);
  return "🗑 Último movimiento eliminado";
}

function mostrarAyuda() {
  return (
    "🤖 Asistente financiero\n\n" +
    "Registrar gasto:\n" +
    "gasto 20000 comida almuerzo\n\n" +
    "Registrar ingreso:\n" +
    "ingreso 50000 trabajo diseño\n\n" +
    "Comandos:\n\n" +
    "saldo\n" +
    "resumen\n" +
    "hoy\n" +
    "categorias\n" +
    "top\n" +
    "borrar"
  );
}

function enviarMensaje(chatId, mensaje) {
  try {
    var url = "https://api.telegram.org/bot" + token + "/sendMessage";
    var payload = {
      chat_id: chatId,
      text: String(mensaje || "")
    };

    var options = {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    UrlFetchApp.fetch(url, options);
  } catch (error) {
    // Evita que falle doPost por errores de red de Telegram.
  }
}

function manejarComando(comando, sheet, chatId) {
  var data = obtenerDatos(sheet);

  if (comando === "saldo") {
    var saldo = calcularSaldo(data);
    enviarMensaje(
      chatId,
      "💰 Saldo actual\n────────────\n" +
        "Ingresos: " + formatearNumero(saldo.ingresos) + "\n" +
        "Gastos: " + formatearNumero(saldo.gastos) + "\n" +
        "Disponible: " + formatearNumero(saldo.saldo)
    );
    return;
  }

  if (comando === "resumen") {
    var resumen = calcularResumen(data);
    enviarMensaje(
      chatId,
      "📊 Resumen financiero\n────────────\n" +
        "Total gastado: " + formatearNumero(resumen.totalGastado) + "\n" +
        "Total ingresos: " + formatearNumero(resumen.totalIngresos) + "\n" +
        "Movimientos registrados: " + resumen.movimientos
    );
    return;
  }

  if (comando === "hoy") {
    var presupuesto = calcularPresupuestoDiario(data);
    enviarMensaje(
      chatId,
      "📅 Presupuesto diario\n────────────\n" +
        "Saldo disponible: " + formatearNumero(presupuesto.saldo) + "\n" +
        "Días restantes: " + presupuesto.diasRestantes + "\n" +
        "Puedes gastar hoy: " + formatearNumero(presupuesto.presupuestoDiario)
    );
    return;
  }

  if (comando === "categorias") {
    var categorias = calcularCategorias(data);
    var lineas = ["📊 Gastos por categoría", "────────────"];
    var tieneDatos = false;

    for (var categoria in categorias) {
      if (categorias.hasOwnProperty(categoria)) {
        lineas.push(categoria + ": " + formatearNumero(categorias[categoria]));
        tieneDatos = true;
      }
    }

    if (!tieneDatos) lineas.push("Sin gastos registrados");
    enviarMensaje(chatId, lineas.join("\n"));
    return;
  }

  if (comando === "top") {
    var top = calcularTopCategorias(data);
    var topLineas = ["🏆 Top gastos", "────────────"];

    if (!top.length) {
      topLineas.push("Sin gastos registrados");
    } else {
      for (var i = 0; i < top.length; i++) {
        topLineas.push((i + 1) + ". " + top[i].categoria + ": " + formatearNumero(top[i].total));
      }
    }

    enviarMensaje(chatId, topLineas.join("\n"));
    return;
  }

  if (comando === "borrar") {
    enviarMensaje(chatId, borrarUltimoMovimiento(sheet));
    return;
  }

  if (comando === "ayuda") {
    enviarMensaje(chatId, mostrarAyuda());
  }
}

function obtenerDatos(sheet) {
  var lastRow = sheet.getLastRow();
  var lastColumn = Math.max(sheet.getLastColumn(), 5);

  if (lastRow <= 0) return [];
  return sheet.getRange(1, 1, lastRow, lastColumn).getValues();
}

function sanitizarTexto(texto) {
  return String(texto || "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function sanitizarCampo(valor, maxLen) {
  var limpio = String(valor || "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  if (maxLen && limpio.length > maxLen) {
    limpio = limpio.substring(0, maxLen);
  }

  return limpio;
}

function normalizarNumero(valor) {
  var limpio = String(valor || "")
    .replace(/\./g, "")
    .replace(/,/g, ".")
    .replace(/[^0-9.-]/g, "");

  var numero = Number(limpio);
  return numero;
}

function esNumeroValido(numero) {
  return typeof numero === "number" && !isNaN(numero) && isFinite(numero);
}

function formatearNumero(numero) {
  if (!esNumeroValido(numero)) return "0";
  return Math.round(numero).toString();
}

function extraerPayloadSeguro(e) {
  if (!e || !e.postData || !e.postData.contents) return null;
  return JSON.parse(e.postData.contents);
}

function respuestaOk() {
  return ContentService.createTextOutput("ok");
}
