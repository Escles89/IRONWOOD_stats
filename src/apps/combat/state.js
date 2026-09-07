  function parseReviveRemaining(statusText) {
    const reviveWordMatch = statusText.match(/(?:reviv(?:e|ing)|respawn(?:ing)?|resurrect(?:ing)?)[^0-9]{0,24}(\d+(?:\.\d+)?)\s*(seconds?|secs?|s|minutes?|mins?|m)\b/i);
    const reviveBareMatch = statusText.match(/(?:reviv(?:e|ing)|respawn(?:ing)?|resurrect(?:ing)?)[^0-9]{0,24}(\d+(?:\.\d+)?)(?!\s*(?:hp|level|xp))/i);
    const reviveClockMatch = statusText.match(/(\d+):(\d{2})[^a-z]{0,12}(?:revive|respawn|resurrect)/i)
      || statusText.match(/(?:reviv(?:e|ing)|respawn(?:ing)?|resurrect(?:ing)?)[^0-9]{0,24}(\d+):(\d{2})/i);
    return reviveWordMatch
      ? Number(reviveWordMatch[1]) * (/m(?:in(?:ute)?s?)?\b/i.test(reviveWordMatch[2]) ? 60000 : 1000)
      : reviveClockMatch ? (Number(reviveClockMatch[1]) * 60 + Number(reviveClockMatch[2])) * 1000
      : reviveBareMatch ? Number(reviveBareMatch[1]) * 1000 : 0;
  }
