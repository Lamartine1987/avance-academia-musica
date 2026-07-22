declare module 'unmute' {
  export default function unmute(context: AudioContext, allowBackgroundPlayback?: boolean, forceIOSBehavior?: boolean): { dispose: () => void };
}
