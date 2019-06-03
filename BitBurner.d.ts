declare interface IHackingMultipliers {
  chance: number,
  speed: number,
  money: number,
  growth: number
}

declare interface IHacknetMultipliers {
  production: number,
  purchaseCost: number,
  ramCost: number,
  coreCost: number,
  levelCost: number
}

declare interface IBitNodeMultipliers {
  ServerMaxMoney: number,
  ServerStartingMoney: number,
  ServerGrowthRate: number,
  ServerWeakenRate: number,
  ServerStartingSecurity: number,
  ManualHackMoney: number,
  ScriptHackMoney: number,
  CompanyWorkMoney: number,
  CrimeMoney: number,
  HacknetNodeMoney: number,
  CompanyWorkExpGain: number,
  ClassGymExpGain: number,
  FactionWorkExpGain: number,
  HackExpGain: number,
  CrimeExpGain: number,
  FactionWorkRepGain: number,
  FactionPassiveRepGain: number,
  AugmentationRepCost: number,
  AugmentationMoneyCost: number,
}

declare interface IHacknetNode {
  name: string;
  level: number;
  ram: number;
  cores: number;
  totalMoneyGenerated: number;
  onlineTimeSeconds: number;
  moneyGainRatePerSecond: number;

  upgradeLevel(levels: number): boolean;
  upgradeRam(): boolean;
  upgradeCore(): boolean;
  getLevelUpgradeCost(levels: number): number;
  getRamUpgradeCost(): number;
  getCoreUpgradeCost(): number;
}

declare interface IGame {
  args: Array<string>
  hacknetnodes: IHacknetNode[];

  hack(hostname: string): Promise<number>;
  grow(hostname: string): Promise<number>;
  weaken(hostname: string): Promise<number>;
  sleep(milliseconds: number): Promise<void>;
  ps(hostname: string): Array<{filename: string, args: string[], threads: number}>;
  print(data: any): void;
  tprint(data: any): void;
  sprintf(format: string, ...args: any): string;
  clearLog(): void;
  disableLog(func: string): void;
  enableLog(func: string): void;
  scan(hostname: string, useHostnames?: boolean): string[];
  nuke(hostname: string): void;
  brutessh(hostname: string): void;
  ftpcrack(hostname: string): void;
  relaysmtp(hostname: string): void;
  httpworm(hostname: string): void;
  sqlinject(hostname: string): void;
  run(script: string, numThreads?: number, ...args: any[]): Promise<boolean>;
  exec(script: string, hostname: string, numThreads?: number, ...args: any[]): Promise<boolean>;
  spawn(script: string, numThreads?: number, ...args: any[]): boolean;
  kill(script: string, hostname: string, ...args: any[]): boolean;
  killall(hostname: string): boolean;
  exit(): void;
  scp(file: string, destination: string): boolean;
  scp(files: string[], destination: string): boolean;
  scp(file: string, source: string, destination: string): boolean;
  scp(files: string[], source: string, destination: string): boolean;
  ls(hostname: string, patter: string): string[];
  hasRootAccess(hostname: string): boolean;
  getHostname(): string;
  getHackingLevel(): number;
  getHackingMultipliers(): IHackingMultipliers;
  getHacknetMultipliers(): IHacknetMultipliers;
  getServerMoneyAvailable(hostname: string): number;
  getServerMaxMoney(hostname: string): number;
  getServerGrowth(hostname: string): number;
  getServerSecurityLevel(hostname: string): number;
  getServerBaseSecurityLevel(hostname: string): number;
  getServerMinSecurityLevel(hostname: string): number;
  getServerRequiredHackingLevel(hostname: string): number;
  getServerNumPortsRequired(hostname: string): number;
  getServerRam(hostname: string): [ number, number ];
  serverExists(hostname: string): boolean;
  fileExists(filename: string, hostname?: string): boolean;
  isRunning(script: string, hostname: string, ...args: any[]): boolean;
  getNextHacknetNodeCost(): number;
  purchaseHacknetNode(): number | false;
  purchaseServer(hostname: string, ram: number): string;
  deleteServer(hostname: string): boolean;
  getPurchasedServers(useHostnames?: boolean): string[];
  write(file: string, data?: string, mode?: string): void;
  write(port: number, data?: string): void;
  read(file: string): string;
  read(port: number): string;
  peek(port: number): string;
  clear(file: string): void;
  clear(port: number): void;
  rm(file: string): boolean;
  scriptRunning(script: string, hostname: string): boolean;
  scriptKill(script: string, hostname: string): boolean;
  getScriptName(): string;
  getScriptRam(script: string, hostname?: string): number;
  getHackTime(hostname: string): number;
  getGrowTime(hostname: string): number;
  getWeakenTime(hostname: string): number;
  getScriptIncome(): [ number, number ];
  getScriptIncome(script: string, hostname: string, ...args: any[]): number;
  getScriptExpGain(): [ number, number ];
  getScriptExpGain(script: string, hostname: string, ...args: any[]): number;
  getTimeSinceLastAug(): number;
  prompt(text: string): Promise<boolean>;
  getBitNodeMultipliers(): IBitNodeMultipliers;

  getStockSymbols(): string[];
  getStockPosition(sym: string): number[];
  getStockPrice(sym: string): number;
  getStockBidPrice(sym: string): number;
  getStockAskPrice(sym: string): number;
  getStockForecast(sym: string): number;
  getStockSaleGain(sym: string, shares: number, positionType: "L" | "S"): number;
  getStockPurchaseCost(sym: string, shares: number, positionType: "L" | "S"): number;
  sellStock(sym: string, shares: number): void;
  buyStock(sym: string, shares: number): void;

  codingcontract: ICodingContract;
}

interface ICodingContract {
  attempt(answer: any, filename: string, hostname: string): boolean;
  getContractType(filename: string, hostname: string): string;
  getDescription(filename: string, hostname: string): string;
  getData(filename: string, hostname: string): any;
  getNumTriesRemaining(filename: string, hostname: string): number;
}
