// Punto de enganche para la despedida animada al cerrar sesión.
// El núcleo no dibuja nada: el módulo auth registra quién la dibuja (FarewellTransition).
// La promesa se resuelve cuando la animación quiere que se cierre la sesión (el login se
// monta debajo y la animación termina sobre él). Si nadie la dibuja, se sale al instante.
type Player = (name: string) => Promise<void>;

let player: Player | null = null;

export function registerFarewell(p: Player) {
  player = p;
  return () => {
    if (player === p) player = null;
  };
}

export function playFarewell(name: string) {
  return player ? player(name) : Promise.resolve();
}
