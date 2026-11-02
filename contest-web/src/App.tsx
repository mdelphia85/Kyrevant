import { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import GameCanvas from './Game/GameCanvas'
import { characterClasses, species, type CharacterClass, type Species } from './characters'
import './App.css'

type Player = { id:string; name:string; isHost:boolean; characterClass:CharacterClass|null; species?:Species; connected?:boolean; ready:boolean; x:number; y:number; facingX:number; facingY:number }
type Enemy = { id:string; type:'Raider'|'Heavy'|'Commander'; x:number; y:number; health:number; maxHealth:number; alive:boolean }
type Room = { code:string; players:Player[]; enemies:Enemy[]; phase:'lobby'|'class-selection'|'mission'|'victory'; gameStarted:boolean }
type Response = {success:boolean; message?:string; room?:Room; roomCode?:string;resumeToken?:string}
const endpoint = import.meta.env.VITE_SERVER_URL || (import.meta.env.DEV ? `${window.location.protocol}//${window.location.hostname}:3001` : window.location.origin)
const socket = io(endpoint, {timeout:20000, reconnection:true, reconnectionDelay:1000, reconnectionDelayMax:5000})
const CLIENT_BUILD='2026-11-02.1'

function Briefing() {
  return <details className="mission-rules"><summary>Mission briefing &amp; how to play</summary>
    <p>Your transport is struck by an asteroid. Stranded on Kyrevant, your unit discovers a plea from citizens captured by the Ashfall militia.</p>
    <ol><li>Gather 2–4 players. Choose a lineage and class, then ready up.</li><li>Read the note near the wreck. Find Elias and rescue the captives.</li><li>Mine resources, build defenses, and protect the settlement through three attacks.</li><li>Follow the militia to the frontier and Citadel. Finish all three chapters to free Kyrevant.</li></ol>
    <p>WASD move · Mouse aim · Hold left click to fire · Q class ability · E interact · M toggle mining. Choose a structure and click the ground to build; Escape returns to combat.</p>
    <p>On phones: use the movement pad, drag the right side to aim, and use the action buttons. Tap the ground in construction view to place a structure.</p>
    <p>Resources and victory are shared. Shields recharge after 4.5 seconds without damage. Downed players redeploy after seven seconds; a fallen squad regroups at the wreck with mission progress retained.</p>
  </details>
}

export default function App() {
  const [updateAvailable,setUpdateAvailable]=useState(false)
  useEffect(()=>{
    const check=()=>{void fetch(`${endpoint}/healthz`,{cache:'no-store'}).then(response=>response.json()).then(data=>setUpdateAvailable(Boolean(data.build&&data.build!==CLIENT_BUILD))).catch(()=>{})}
    check();const timer=window.setInterval(check,60000);return()=>window.clearInterval(timer)
  },[])
  const updateNotice=updateAvailable&&<div className="release-notice" role="status">A newer game build is available. Refresh after this match to load it. <button onClick={()=>window.location.reload()}>Load update</button></div>
  const [name,setName] = useState(() => sessionStorage.getItem('kyrevant-name') || '')
  const [code,setCode] = useState(() => new URLSearchParams(window.location.search).get('room')?.toUpperCase() || '')
  const [room,setRoom] = useState<Room|null>(null)
  const [error,setError] = useState('')
  const [connected,setConnected] = useState(socket.connected)
  const [busy,setBusy] = useState(false)
  const [copied,setCopied] = useState(false)
  const [lineage,setLineage] = useState<Species>('Human')
  const previousRoom = useRef<string|null>(null)
  useEffect(() => {
    let disposed=false
    const update = (value:Room) => {
      previousRoom.current=value.code;setRoom(value);setCode(value.code)
      const url=new URL(window.location.href);url.searchParams.set('room',value.code);window.history.replaceState(null,'',url)
    }
    const connect = () => {
      setConnected(true);setBusy(false)
      const token=sessionStorage.getItem('kyrevant-session')
      if(!token){socket.emit('request-room-state');return}
      setBusy(true)
      socket.timeout(15000).emit('resume-session',{token},(timeout:Error|null,response:Response)=>{
        if(disposed)return
        setBusy(false)
        if(timeout){setError('Your squad could not be restored yet. Refresh to retry; your saved session is retained.');return}
        if(response?.success&&response.room){setError('');update(response.room)}
        else {sessionStorage.removeItem('kyrevant-session');setRoom(null);previousRoom.current=null;setError(response?.message||'Your previous session has ended.')}
      })
    }
    const disconnect = () => {setConnected(false);setBusy(false)}
    const restore = (value:Room|null) => {
      if(value) update(value)
      else if(previousRoom.current){setRoom(null);previousRoom.current=null;setError('The session ended. Create a new party or join your friends again.')}
    }
    const replaced=()=>{sessionStorage.removeItem('kyrevant-session');previousRoom.current=null;setRoom(null);setConnected(false);setBusy(false);setError('This character was restored in another tab. Refresh here to create a separate player.')}
    socket.on('connect',connect)
    socket.on('disconnect',disconnect)
    socket.on('connect_error',disconnect)
    socket.on('session-state',restore)
    socket.on('session-replaced',replaced)
    for(const event of ['room-updated','game-started','mission-started']) socket.on(event,update)
    if(socket.connected)connect()
    return () => {
      disposed=true
      socket.off('connect',connect);socket.off('disconnect',disconnect);socket.off('connect_error',disconnect);socket.off('session-state',restore)
      socket.off('session-replaced',replaced)
      for(const event of ['room-updated','game-started','mission-started']) socket.off(event,update)
    }
  },[])
  const request = (event:string,data:unknown) => {
    if(!socket.connected){setError('Connecting to the server. Please wait and try again.');return}
    setError('');setBusy(true)
    socket.timeout(15000).emit(event,data,(timeout:Error|null,response:Response) => {
      setBusy(false)
      if(timeout){setError('The server did not respond. Please try again.');return}
      if(!response?.success){setError(response?.message || 'Unable to complete that action.');return}
      if(response.resumeToken)sessionStorage.setItem('kyrevant-session',response.resumeToken)
      if(response.room){previousRoom.current=response.room.code;setRoom(response.room);setCode(response.room.code);const url=new URL(window.location.href);url.searchParams.set('room',response.room.code);window.history.replaceState(null,'',url)}
    })
  }
  const enter = (join:boolean) => {
    if(!name.trim()){setError('Enter your player name first.');return}
    if(join && !/^[A-Z2-9]{5}$/.test(code.trim())){setError('Enter the five-character room code.');return}
    sessionStorage.setItem('kyrevant-name',name.trim())
    request(join?'join-room':'create-room',join?{roomCode:code.trim(),playerName:name.trim()}:name.trim())
  }
  const leave=()=>{
    if(!connected){setError('Reconnect before leaving the squad.');return}
    socket.timeout(15000).emit('leave-room',{},(timeout:Error|null,response:Response)=>{
      if(timeout||!response?.success){setError('Could not leave the squad. Please try again.');return}
      sessionStorage.removeItem('kyrevant-session');previousRoom.current=null;setRoom(null);setError('');setBusy(false)
      const url=new URL(window.location.href);url.searchParams.delete('room');window.history.replaceState(null,'',url)
    })
  }
  const current = room?.players.find(player=>player.id===socket.id)
  const choose = (characterClass:CharacterClass, selectedSpecies:Species=lineage) => socket.emit('select-class',{roomCode:room?.code,characterClass,species:selectedSpecies})
  const share = async () => {
    try {const url=new URL(window.location.href);url.searchParams.set('room',room!.code);await navigator.clipboard.writeText(url.toString());setCopied(true)}
    catch{setError(`Share this room code: ${room?.code}`)}
  }
  const status = <div className={`connection-status ${connected?'online':'offline'}`} role="status">{connected?'● SERVER ONLINE':'● CONNECTING — free hosting may take about a minute to wake up'}</div>
  const party = room && <section className="players-panel"><div className="players-heading"><h2>Your unit</h2><span>{room.players.length}/4 players</span></div><div className="player-list">{room.players.map(player=><div className="player-row" key={player.id}><div className="player-avatar">{player.name.charAt(0).toUpperCase()}</div><div className="player-info"><strong>{player.name}{player.id===socket.id?' (you)':''}</strong><span>{player.characterClass?`${player.species||'Human'} · ${player.characterClass}`:player.isHost?'Squad leader':'Operator'}</span></div><div className="online-indicator">{player.connected===false?'Reconnecting…':player.ready?'Ready':room.phase==='class-selection'?'Choosing':'Joined'}</div></div>)}</div></section>
  if(room && (room.phase==='mission'||room.phase==='victory'))return <div className="app-shell mission-shell">{updateNotice}{!connected&&<div className="reconnect-banner" role="alert">Connection lost. Reconnecting to your squad… Keep this tab open.</div>}<GameCanvas room={room} socket={socket} onLeave={leave}/></div>
  return <div className="app-shell"><main className={`game-card ${room?'lobby-card':''}`}>
    <div className="brand">KYREVANT <span className="brand-chapter">/ THE LAST LIGHT</span></div>
    {status}{updateNotice}<small className="release-build">FRONTIER · BUILD {CLIENT_BUILD}</small>
    {!room ? <><p className="eyebrow">A COOPERATIVE SCI-FI FANTASY CAMPAIGN</p><h1>Survive the fall.<br/>Bring them home.</h1><p className="subtitle">Your unit. An unknown world. A people worth fighting for. Play together from separate devices—no account or download.</p><Briefing/>
      <form onSubmit={event=>{event.preventDefault();enter(false)}}><div className="form-group"><label htmlFor="playerName">Player Name</label><input id="playerName" autoComplete="nickname" value={name} maxLength={20} placeholder="Your callsign" onChange={event=>setName(event.target.value)}/></div><button className="primary-button" disabled={!connected||busy} type="submit">{busy?'Please wait…':'Create Room'}</button></form>
      <div className="divider"><span>OR JOIN YOUR UNIT</span></div><form onSubmit={event=>{event.preventDefault();enter(true)}}><div className="form-group"><label htmlFor="roomCode">Room Code</label><input id="roomCode" autoCapitalize="characters" autoComplete="off" value={code} maxLength={5} placeholder="Five-character code" onChange={event=>setCode(event.target.value.toUpperCase())}/></div><button type="submit" className="secondary-button" disabled={!connected||busy}>Join Room</button></form>
    </> : room.phase==='class-selection' ? <><h1>Choose your path.</h1><p className="subtitle">Your lineage shapes your armor. Your class shapes your role in the unit.</p><fieldset className="lineage-picker" disabled={current?.ready}><legend>Lineage</legend>{species.map(option=><button type="button" className={lineage===option.name?'lineage selected-class':'lineage'} key={option.name} onClick={()=>{setLineage(option.name);if(current?.characterClass)choose(current.characterClass,option.name)}}><strong>{option.name}</strong><small>{option.description}</small></button>)}</fieldset><div className="class-grid">{characterClasses.map(option=><button key={option.name} className={`class-card ${current?.characterClass===option.name?'selected-class':''}`} disabled={current?.ready} onClick={()=>choose(option.name)}><strong>{option.name}</strong><span>{option.description}</span></button>)}</div>{party}<button className="primary-button" disabled={!connected||busy||!current?.characterClass||current?.ready} onClick={()=>request('set-ready',room.code)}>{current?.ready?'Ready — waiting for the unit':'Lock In Class'}</button></> : <><h1>Assemble your unit.</h1><p className="subtitle">Invite 1–3 friends. Everyone opens the same link and joins with this code.</p><div className="room-code-panel"><span className="room-code-label">ROOM CODE</span><div className="room-code">{room.code}</div><button className="secondary-button" onClick={share}>{copied?'Invite link copied':'Copy invite link'}</button></div>{party}<Briefing/>{current?.isHost?<button className="primary-button" disabled={!connected||busy||room.players.length<2} onClick={()=>request('start-game',room.code)}>{room.players.length<2?'Waiting for a second player':'Begin Battle'}</button>:<p className="subtitle">Waiting for the squad leader to begin.</p>}</>}
    {room&&<button type="button" className="secondary-button" onClick={leave} disabled={!connected||busy}>Leave room</button>}
    {error&&<div className="error-message" role="alert">{error}</div>}<p className="entry-footer">2–4 PLAYERS · THREE CHAPTERS · ONE SHARED VICTORY</p>
  </main></div>
}
