/*!
 * Helper for log messages. Ensures the date, area of the app, and log level are logged along with the provided
 * message. Errors are also formatted to make review easier!
 *
 * WINK WINK REDDIT ADMIN REVIEWING ;)
 *
 * Author: u/Beach-Brews
 * License: BSD-3-Clause
 */

import { settings } from '@devvit/web/server';

// Represents the log level for a logger
export enum LogLevel {
    Error,
    Warn,
    Info,
    Debug,
    Trace
}

/**
 * A helper class used for logging messages on the Devvit backend, allowing different log levels to be set via an
 * App Setting. The format of the log messages are as follows:
 *
 * ${yyyy-MM-dd:HH:mm:ss} [${#label}] ${#logLevel} - ${providedMessage}
 */
export class Logger {

	// A label used to identify an area this logger called from, such as a specific API or scheduler task
    #label: string;
	
	// The log level (obtained from settings)
    #logLevel: LogLevel;
	
	// Saves the name provided in traceStart(name) to print the same name when traceEnd() is called.
    #traceName: string | undefined;

	// Creates a new logger with the given label
    public static async Create(label: string): Promise<Logger> {
        return new Logger(label, await Logger.GetLogLevelSetting());
    }
	
	// Obtains the setting value from the app settings (so log level can be changed without requiring an app update)
    // NOTE: I usually place this in its own "AppSettings" helper class, where all of my app settings are
    //       (with constants for setting key name)
    public static async GetLogLevelSetting(): Promise<LogLevel> {
        const savedLvl = await settings.get<string[]>('logLevel');
        const key = savedLvl && savedLvl.length > 0 && savedLvl[0] ? savedLvl[0] : null;
        return (key ? LogLevel[key as keyof typeof LogLevel] : LogLevel.Error) ?? LogLevel.Error;
    }

    // Creates a new Logger with the given name and log level
    public constructor(label: string, logLevel?: LogLevel) {
        this.#label = label;
        this.#logLevel = logLevel ?? LogLevel.Warn;
    }

    // Gets the label for this logger
    public get label() { return this.#label; }

    // Sets the label (after creation) of this logger
    public set label(val: string) { this.#label = val; }

    // Gets the logger's current log level
    public get logLevel() { return this.#logLevel; }

    // Updates the logger's log level (after creation)
    public set logLevel(val: LogLevel) { this.#logLevel = val; }

    // Prints a "start trace heading" with the name provided
    public traceStart(name: string) {
        this.#traceName = name;
        this.trace(`===== Start - ${name} =====`);
    }

    // Prints an "end trace heading" with the name sent to traceStart previously.
    public traceEnd() {
        if (!this.#traceName) throw new Error('traceEnd was called before traceStart');
        this.trace(`===== End - ${this.#traceName} =====`);
        this.#traceName = undefined;
    }

    // Prints a Trace level log
    public trace(...msg: unknown[]): void {
        if (this.isLogEnabled(LogLevel.Trace))
            console.trace(this.formatMessage(LogLevel.Trace, ...msg));
    }

    // Prints a Debug level log
    public debug(...msg: unknown[]): void {
        if (this.isLogEnabled(LogLevel.Debug))
            console.debug(this.formatMessage(LogLevel.Debug, ...msg));
    }

    // Prints an Info level log
    public info(...msg: unknown[]): void {
        if (this.isLogEnabled(LogLevel.Info))
            console.log(this.formatMessage(LogLevel.Info, ...msg));
    }

    // Prints a Warn level log
    public warn(...msg: unknown[]): void {
        if (this.isLogEnabled(LogLevel.Warn))
            console.warn(this.formatMessage(LogLevel.Warn, ...msg));
    }

    // Prints an Error level log
    public error(...msg: unknown[]): void {
        if (this.isLogEnabled(LogLevel.Error))
            console.error(this.formatMessage(LogLevel.Error, ...msg));
    }

    // Determines if the log level provided is "enabled" and should be logged
    public isLogEnabled(level: LogLevel): boolean {
        return level <= this.#logLevel;
    }

    // Helper to get the log date
    public getLogDateFormat(): string {
        const d = new Date();
        const pad = (n: number) => n.toString().padStart(2, '0');
        return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
    }

    // If an error is provided as an argument, it will print the details of that log
    public formatError(e: Error): string {
        let txt = ``;
        if (e.stack && e.stack.length > 0) {
            txt += `--- Stack Trace:\n${e.stack}\n`;
        }
        // In this case, any is acceptable to determine if the stack or cause exists
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cause = (e as any)?.cause?.stack || (e as any)?.cause;
        if (cause) {
            txt += `--- Cause:\n${cause}\n`;
        }
        return txt.length > 0 ? `\n----------\n${e}\n${txt}----------` : `${e}`;
    }

    // Gets a consistently formatted log message (see class comment for details)
    public formatMessage(level: LogLevel, ...msg: unknown[]): string {
        const msgFmt = msg.map(o =>
            o === undefined
                ? '<undefined>'
                : o === null
                    ? '<null>'
                    : o instanceof Error
                        ? this.formatError(o)
                        : (Array.isArray(o) || typeof o === 'object')
                            ? JSON.stringify(o)
                            : `${o}`
        );
        return `${this.getLogDateFormat()} [${this.#label}] ${LogLevel[level].toUpperCase()} - ${msgFmt.join(' ')}`;
    }

}
