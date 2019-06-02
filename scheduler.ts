function findUnownedServers(ns: IGame) {
  let queue = ["home"];
  let out: string[] = [];
  while (queue.length > 0) {
      let host = queue.shift()!;
      if (!ns.hasRootAccess(host)) continue;
      out.push(host);
      ns.scan(host).forEach(scanned => {
          if (out.find(x => x == scanned) !== undefined) return;
          queue.push(scanned);
      });
  }
  return out;
}

/**
 * @param {Job} a
 * @param {Job} b
 */
function isSameJob(a: Job, b: Job) {
  if (a.filename != b.filename || a.args.length != b.args.length) return false;
  for (let i = 0; i < a.args.length; ++i) {
    if (a.args[i] != b.args[i]) return false;
  }
  return true;
}

function listOwnedServers(ns: IGame) {
  throw new Error("todo");
}

class Server {
  ns: IGame;
  hostname: string;
  tasks: Job[];
  ram: number;
  used: number;
  constructor(ns: IGame, hostname: string) {
      this.ns = ns;
      this.hostname = hostname;
      this.tasks = ns.ps(hostname);
      [this.ram, this.used] = ns.getServerRam(this.hostname);
  }

  get available() {
    return this.ram - this.used;
  }

  isRunning(filename: string, args: string[]) {
      let j = {
          filename: filename,
          args: args,
          threads: 0,
      };
      return this.tasks.some(t => isSameJob(j, t));
  }
}

export interface Job {
  filename: string;
  args: string[];
  threads: number;
}

interface ServerJob {
  hostname: string;
  job: Job;
}

// Returns the number of threads job is using on server.
function jobThreadsOn(ns: IGame, job: Job, server: Server) {
  let task = server.tasks.filter(t => isSameJob(job, t))[0];
  if (task === undefined) return 0;
  return task.threads;
}

async function jobIsGone(ns: IGame, job: Job, hostname: string) {
  let start = Date.now();
  while (ns.isRunning(job.filename, hostname, ...job.args)) {
      await ns.sleep(500);
      if (Date.now() - start > 20000) {
          ns.tprint("a while passed since we killed " +
              "a job and it's still running: " + JSON.stringify(job));
          ns.tprint("trying to kill it again");
          await ns.kill(job.filename, hostname, ...job.args);
          start = Date.now();
      }
  }
}

function loadServers(ns: IGame) {
  return findUnownedServers(ns).map(h => new Server(ns, h));
}

let lockFile = "scheduler_lock.txt";
let dbFile = "scheduler_db.txt";

function loadJobs(ns: IGame): Job[] {
  let data = ns.read(dbFile);
  if (data.length === 0) return [];
  return JSON.parse(data);
}

function storeJobs(ns: IGame, jobs: Job[]) {
  ns.write(dbFile,
           JSON.stringify(jobs.filter(j => j.threads > 0), undefined, 2),
           "w");
}

async function lock(ns: IGame) {
  let start = Date.now();
  while (ns.read(lockFile) != "") {
      await ns.sleep(100 + Math.random() * 25);
      if (Date.now() > start + 10000) {
          ns.tprint("scheduler lock is still locked after 10s, current holder: " + ns.read(lockFile));
          start = Date.now();
      }
  }
  ns.write(lockFile, ns.sprintf("%s %s", ns.getScriptName(), JSON.stringify(ns.args)));
}

function unlock(ns: IGame) {
  ns.rm(lockFile);
}

function doList(ns: IGame, jobs: Job[]) {
  jobs.forEach(j => {
      console.log(j);
      ns.tprint(ns.sprintf("%s %s (%d thread(s))", j.filename, j.args.join(" "), j.threads));
  });
}

function doListUnowned(ns: IGame, jobs: Job[], servers: Server[]) {
  servers.forEach(s => {
    s.tasks.forEach(t => {
      if (jobs.some(j => isSameJob(j, t))) return;
      // We found a task that doesn't match any of the jobs we have listed in our
      // db. Print it to the terminal.
      ns.tprint(ns.sprintf(
          "%s: %s %s%s",
          s.hostname,
          t.filename,
          t.args.join(" "),
          t.threads > 1 ? ns.sprintf(" (%d threads)", t.threads) : ""));
    });
  });
}

function parseSpec(ns: IGame, args: string[]): Job{
  if (args.length < 1) throw new Error("unparseable spec in " + args.join(" "));
  let filename = args.shift()!;
  let threads = 1;
  if (args[0] == "-t") {
      args.shift();
      threads = parseInt(args.shift()!);
  }
  return {filename: filename, args: [...args], threads: threads};
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

function ramUsage(ns: IGame, job: Job) {
    return ns.getScriptRam(job.filename) * job.threads;
}

function computeAssignment(ns: IGame, jobs: Job[], servers: Server[]) {
  // Determine the amount of free ram per server. Jobs we are scheduling are disregarded in this computation.
  let serverInfo = servers.map(s => { return {
      tasks: [...s.tasks],
      hostname: s.hostname,
      ram: s.ram,
      get availableRam() {
        const homeAdjustment = (this.hostname != "home") ? 0 : Math.max(32, 0.2 * this.ram);
        const tasksRam = this.tasks.map(t => ramUsage(ns, t)).reduce((s, n) => s + n, 0);
        return Math.max(0, this.ram - tasksRam - homeAdjustment);
      },
      hasJob: function (j: Job) {
        return this.tasks.some(t => isSameJob(t, j));
      }
  }});
  let jobInfo = jobs.map((j: Job) => {
    let taskSum = 0;
    for (const s of serverInfo) {
      const thisTask = s.tasks.find(t => isSameJob(t, j));
      if (thisTask) taskSum += thisTask.threads;
    }
    return {
        filename: j.filename,
        args: j.args,
        threads: j.threads,
        priorThreads: taskSum,
        confirmedThreads: 0,
        get netThreads() {
          return j.threads - this.priorThreads;
        }
    };
  })

  // @type {Array<ServerJob>}
  let toStop = [];
  let toStart = [];
  // We first look at jobs that are losing threads. This way, we free up space before trying to
  // decide if we can accomodate increases in utilization.
  jobInfo.sort((a, b) => a.netThreads - b.netThreads);
  for (const job of jobInfo) {
    serverInfo.sort((a, b) => {
      const jobDiff = (a.hasJob(job) ? 1 : 0) - (b.hasJob(job) ? 1 : 0);
      if (jobDiff != 0) return jobDiff;
      return b.ram - a.ram;
    });
    for (const server of serverInfo) {
      const tasks = server.tasks;
      const existingTaskIndex = tasks.findIndex(t => isSameJob(t, job) && t.threads > 0);
      const existingTask = existingTaskIndex > -1 ? tasks[existingTaskIndex] : undefined;
      const existingThreads = existingTask ? existingTask.threads : 0;
      const available = server.availableRam;
      const maxThreads = Math.floor(available / ns.getScriptRam(job.filename)) + existingThreads;
      const desiredThreads = job.threads - job.confirmedThreads;
      const targetThreads = Math.min(desiredThreads, maxThreads);
      job.confirmedThreads += targetThreads;

      const schedulable = {hostname: server.hostname, job: {filename: job.filename, args: job.args, threads: targetThreads}};
      if (existingThreads == targetThreads) {
          continue;
      }

      if (existingTask) {
        // The number of threads is being changed. That compels us to first kill this task on this server.
        toStop.push(schedulable);
        tasks[existingTaskIndex] = schedulable.job;
      } else {
        tasks.push(schedulable.job);
      }
      toStart.push(schedulable);
    }
  }

  console.debug(toStart, toStop);
  return {toStop: toStop, toStart: toStart};
}

async function stopAll(ns: IGame, jobs: ServerJob[]) {
  for (const j of jobs) {
    ns.kill(j.job.filename, j.hostname, ...j.job.args);
  }
  for (const j of jobs) {
    await jobIsGone(ns, j.job, j.hostname);
  }
}

async function startAll(ns: IGame, jobs: ServerJob[]) {
  for (const j of jobs) {
    if (j.job.threads <= 0) continue;
    ns.scp(j.job.filename, "home", j.hostname);
    await ns.exec(j.job.filename, j.hostname, j.job.threads, ...j.job.args);
  }
}

async function checkIntegrity(ns: IGame, jobs: Job[], servers: Server[], removeUnknownJobs: boolean) {
  jobs.forEach(j => { j.threads = 0; });

  const toStop: ServerJob[] = [];
  servers.forEach(s => {
      s.tasks.forEach(t => {
          let job = jobs.find(j => isSameJob(j, t));
          if (job === undefined) {
              let privileged = t.filename == "scheduler.js" || s.hostname == "home";
              if (!privileged && removeUnknownJobs) {
                toStop.push({hostname: s.hostname, job: t});
              }
          } else {
              job.threads += jobThreadsOn(ns, t, s);
          }
      });
  });
  jobs = jobs.filter(j => j.threads > 0);

  await stopAll(ns, toStop);
}

export class Scheduler {
  ns: IGame;
  haveLock: boolean;
  jobs: Job[] = [];
  servers: Server[] = [];
  constructor(ns: IGame) {
      this.ns = ns;
      this.haveLock = false;
      ns.disableLog("getServerRam");
  }

  async beginTransaction() {
      await lock(this.ns);
      this.haveLock = true;
      this.load();
  }

  maybeCommitTransaction() {
      if (!this.haveLock) return;
      storeJobs(this.ns, this.jobs);
      this.haveLock = false;
      unlock(this.ns);
  }

  // You can use load directly when you're not planning on modifying the scheduler
  // state.
  load() {
      this.jobs = loadJobs(this.ns);
      this.servers = loadServers(this.ns);
  }

  async start(job: Job) {
      if (!this.haveLock) {
          throw new Error("tried to call Scheduler.start() without an active transaction.");
      }
      await this.scheduleAll([job]);
  }

  async stop(job: Job) {
      if (!this.haveLock) {
          throw new Error("tried to call Scheduler.stop() without an active transaction.");
      }
      job.threads = 0;
      await this.scheduleAll([job]);
  }

  /**
   * @param jobs {Array<Job>}
   */
  async scheduleAll(jobs: Job[]) {
    if (!this.haveLock) {
      throw new Error("tried to call Scheduler.scheduleAll() without an active transaction.");
    }
    this.ns.print(`Scheduling these jobs: ${JSON.stringify(jobs, undefined, 2)}`);
    const assignment = computeAssignment(this.ns, jobs, this.servers);
    console.debug(assignment);
    await stopAll(this.ns, assignment.toStop);
    await startAll(this.ns, assignment.toStart);
    const newJobs = this.jobs.filter(j => !jobs.some(j2 => isSameJob(j, j2)));
    for (const j of jobs) if (j.threads > 0) newJobs.push(j);
    this.jobs = newJobs;
  }

  async checkIntegrity(killUnknownJobs: boolean) {
      if (!this.haveLock && killUnknownJobs) {
          throw new Error("tried to call Scheduler.checkIntegrity(true) without an active transaction.");
      }
      await checkIntegrity(this.ns, this.jobs, this.servers, killUnknownJobs);
  }

  ram() {
      return this.servers.map(s => s.ram).reduce((a, b) => a + b, 0);
  }

  ramAvailable() {
      return this.servers.map(s => s.available).reduce((a, b) => a + b, 0);
  }

  // Reschedules all jobs in the jobs database with their current thread count. This is to cover a situation
  // where some tasks were killed outside the scheduler and we want to restore the scheduled state of the
  // world.
  async reschedule() {
      if (!this.haveLock) {
          throw new Error("tried to call Scheduler.reschedule() without an active transaction.");
      }
      this.scheduleAll(this.jobs);
  }
}

export async function main(ns: IGame) {
  // jobspec: filename [args]
  // commands:
  //     start -t NUMTHREADS jobspec   # Start one owned job.
  //     stop jobspec                  # Stop one owned job.
  //     list                          # List all owned jobs.
  //     listunowned                   # List all unowned jobs, excepting jobs on home.
  //     fsck                          # Delete all unowned jobs, excepting jobs on home.
  if (ns.args.length < 1) return;
  let scheduler = new Scheduler(ns);
  try {
      let command = ns.args.shift();
      if (command == "list") {
          scheduler.load();
          console.log(scheduler.jobs);
          doList(ns, scheduler.jobs);
      } else if (command == "listunowned") {
          scheduler.load();
          doListUnowned(ns, scheduler.jobs, scheduler.servers);
      } else if (command == "available") {
          scheduler.load();
          ns.tprint("ram available to scheduler: " + scheduler.ramAvailable());
      } else if (command == "start") {
          await scheduler.beginTransaction();
          await scheduler.start(parseSpec(ns, ns.args));
      } else if (command == "stop") {
          await scheduler.beginTransaction();
          await scheduler.stop(parseSpec(ns, ns.args));
      } else if (command == "fsck") {
          await scheduler.beginTransaction();
          await scheduler.checkIntegrity(true);
      } else if (command == "reschedule") {
          await scheduler.beginTransaction();
          await scheduler.reschedule();
      } else {
          ns.tprint("unknown command: " + command);
      }
  } finally {
      scheduler.maybeCommitTransaction();
  }
}
