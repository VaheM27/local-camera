const wsUrl = () => `wss://${location.host}/ws`;
const RTC_CONFIG = { iceServers: [] }; // только LAN: STUN не нужен, ничего не уходит наружу
