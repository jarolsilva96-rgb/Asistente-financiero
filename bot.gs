var token = "8687553336:AAGKVOTDfCKDO2qM8QX7vajucrj5zhH70tg";

function doPost(e) {

  var data = JSON.parse(e.postData.contents);
  var text = data.message.text.trim().toLowerCase();
  var chatId = data.message.chat.id;

  var sheet = SpreadsheetApp
  .getActiveSpreadsheet()
  .getSheetByName("Movimientos");

  // COMANDO SALDO
  if(text === "saldo"){

    var datos = sheet.getDataRange().getValues();

    var ingresos = 0;
    var gastos = 0;

    for(var i=1;i<datos.length;i++){

      if(datos[i][1] === "ingreso"){
        ingresos += Number(datos[i][3]);
      }

      if(datos[i][1] === "gasto"){
        gastos += Number(datos[i][3]);
      }

    }

    var saldo = ingresos - gastos;

    enviarMensaje(chatId,"💰 Saldo actual: " + saldo);

    return;
  }

  // COMANDO RESUMEN
  if(text === "resumen"){

    var datos = sheet.getDataRange().getValues();
    var gastos = 0;

    for(var i=1;i<datos.length;i++){

      if(datos[i][1] === "gasto"){
        gastos += Number(datos[i][3]);
      }

    }

    enviarMensaje(chatId,"📊 Total gastado: " + gastos);

    return;
  }

  // COMANDO BORRAR ÚLTIMO
  if(text === "borrar"){

    var ultimaFila = sheet.getLastRow();

    if(ultimaFila > 1){

      sheet.deleteRow(ultimaFila);

      enviarMensaje(chatId,"🗑 Último movimiento eliminado");

    }else{

      enviarMensaje(chatId,"No hay movimientos para borrar");

    }

    return;
  }

  // COMANDO HOY (cuánto puedes gastar hoy)
  if(text === "hoy"){

    var datos = sheet.getDataRange().getValues();

    var ingresos = 0;
    var gastos = 0;

    for(var i=1;i<datos.length;i++){

      if(datos[i][1] === "ingreso"){
        ingresos += Number(datos[i][3]);
      }

      if(datos[i][1] === "gasto"){
        gastos += Number(datos[i][3]);
      }

    }

    var saldo = ingresos - gastos;

    var hoy = new Date();

    var ultimoDia = new Date(hoy.getFullYear(), hoy.getMonth()+1,0).getDate();

    var diaActual = hoy.getDate();

    var diasRestantes = ultimoDia - diaActual;

    if(diasRestantes <= 0){
      diasRestantes = 1;
    }

    var disponibleHoy = Math.floor(saldo / diasRestantes);

    enviarMensaje(chatId,"📅 Hoy puedes gastar: " + disponibleHoy);

    return;
  }

  // REGISTRO DE MOVIMIENTOS
  var partes = text.split(" ");

  var tipo = partes[0];

  if(tipo !== "gasto" && tipo !== "ingreso"){

    enviarMensaje(chatId,"❌ Comando no reconocido");

    return;
  }

  var valor = partes[1];
  var categoria = partes[2];
  var descripcion = partes.slice(3).join(" ");

  sheet.appendRow([
    new Date(),
    tipo,
    categoria,
    valor,
    descripcion
  ]);

  enviarMensaje(chatId,"✅ Movimiento registrado");

}

function enviarMensaje(chatId,mensaje){

  var url = "https://api.telegram.org/bot"+token+"/sendMessage";

  var payload = {
    chat_id: chatId,
    text: mensaje
  };

  var options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload)
  };

  UrlFetchApp.fetch(url, options);

}
