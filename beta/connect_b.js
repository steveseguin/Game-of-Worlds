// let's invite Firefox to the party.
if (window.MozWebSocket) {
  window.WebSocket = window.MozWebSocket;
}

function openConnection() {
  // uses global 'conn' object
  if (conn.readyState === undefined || conn.readyState > 1) {
    conn = new WebSocket('ws://127.0.0.1:1337');    
    conn.onopen = function () {
      state.className = 'success';
      state.innerHTML = 'Socket open';
      chat.style.visibility = 'visible';

    };

    conn.onmessage = function (event) {
      // console.log(event.data);
      var message = event.data; //JSON.parse(event.data);
      if (!(/^\d+$/).test(message)) {
      	      log.innerHTML = '<li class="them">' + message.replace(/[<>&]/g, function (m) { return entities[m]; }) + '</li>' + log.innerHTML;

	      clearTimeout(chatfadetimer);
              setalpha(log,100);
              chatfadevalue=100;
              chatfadetimer = setTimeout('chatfade(log);',4000);

      } else {
        connected.innerHTML = message;
      }
    };
    
    conn.onclose = function (event) {
      state.className = 'fail';
      state.innerHTML = 'Socket closed';
      connected.innerHTML = '-';

    };
  }
}

var connected = document.getElementById('connected'),
    log = document.getElementById('log'),
    chat = document.getElementById('chat'),
    form = chat.form,
    conn = {},
    state = document.getElementById('status'),
    entities = {
      '<' : '<',
      '>' : '>',
      '&' : '&'
    };


if (window.WebSocket === undefined) {
  state.innerHTML = 'Sockets not supported';
  state.className = 'fail';
}
 else {
  state.onclick = function () {
    if (conn.readyState !== 1) {
      conn.close();
      setTimeout(function () {
        openConnection();
      }, 250);
    }
  };
  
  addEvent(form, 'submit', function (event) {
    event.preventDefault();

    // if we're connected
    if (conn.readyState === 1) {
      conn.send(JSON.stringify(chat.value));
      log.innerHTML = '<li class="you">' + chat.value.replace(/[<>&]/g, function (m) { return entities[m]; }) + '</li>' + log.innerHTML;

              clearTimeout(chatfadetimer);
              setalpha(log,100);
              chatfadevalue=100;
              chatfadetimer = setTimeout('chatfade(log);',8000);

      chat.value = '';
    }
  });

  openConnection();  
}

function changeSector(sectorid){
 // if we're connected
    if (conn.readyState === 1) {
      conn.send(JSON.stringify(sectorid));
    }
}
