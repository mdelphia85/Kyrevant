import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
const port = 3101
const buildIndex=process.argv.indexOf('--build')
const expectedBuild=buildIndex>=0?process.argv[buildIndex+1]:null
const urlIndex=process.argv.indexOf('--url')
const origin = urlIndex >= 0 ? process.argv[urlIndex+1] : `http://127.0.0.1:${port}`
const server = urlIndex >= 0 ? null : spawn(process.execPath, ['--import', 'tsx', 'server/server.ts'], {env:{...process.env,PORT:String(port),NODE_ENV:'production',PUBLIC_URL:origin},stdio:['ignore','pipe','pipe']})
let output=''
server?.stdout.on('data',chunk=>{output+=chunk})
server?.stderr.on('data',chunk=>{output+=chunk})
try {
  let ready=false
  for(let attempt=0;attempt<60;attempt++){
    if(server && server.exitCode!==null) throw new Error(`Server stopped: ${output}`)
    try {const response=await fetch(`${origin}/healthz`,{signal:AbortSignal.timeout(1000)});if(response.ok && (!expectedBuild || (await response.json()).build===expectedBuild)){ready=true;break}}catch{}
    await delay(500)
  }
  if(!ready)throw new Error(`Server failed readiness: ${output}`)
  const response=await fetch(origin)
  if(!response.ok || !(await response.text()).includes('root')) throw new Error('Built client not served')
  const test=spawn(process.execPath,[process.argv.includes('--campaign')?'scripts/campaign-test.mjs':'scripts/multiplayer-smoke.mjs'],{env:{...process.env,TEST_SERVER_URL:origin},stdio:'inherit'})
  const code=await new Promise(resolve=>test.once('exit',resolve))
  if(code!==0)throw new Error(`Multiplayer check exited ${code}`)
  console.log('PASS: production health endpoint and built website are reachable.')
} finally {server?.kill()}
