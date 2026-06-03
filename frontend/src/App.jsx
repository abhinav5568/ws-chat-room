
function App() {
  var socket = new WebSocket( "ws://echo.websocket.org" );
  socket.onopen(() => {
    console.log('on open event')
  })
  return (
    <>
      <h1>Hello ws</h1>
    </>
  )
}

export default App
