
import { useEffect, useRef } from 'react';

import { supabase } from '@/services/supabase';

// Identificador único para evitar reutilizar canales anteriores.
let channelSequence = 0;

/**
 * Actualiza la pantalla cuando cambian las dosis en Supabase.
 * Controla suscripciones, actualizaciones simultáneas y limpieza.
 */
export function useDoseRealtimeRefresh(
  userId: string | null | undefined,
  onChange: () => void | Promise<void>,
) {
  const onChangeRef = useRef(onChange);

  // Mantiene actualizada la función sin recrear la suscripción.
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!userId) return;

    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let refreshInFlight = false;
    let refreshQueued = false;

    const REFRESH_DELAY = 150;

    async function runRefresh() {
      timer = null;

      if (!active) return;

      if (refreshInFlight) {
        refreshQueued = true;
        return;
      }

      refreshInFlight = true;

      try {
        await onChangeRef.current();
      } catch {
        // La pantalla maneja los errores de actualización.
      } finally {
        refreshInFlight = false;

        if (active && refreshQueued) {
          refreshQueued = false;

          timer = setTimeout(() => {
            void runRefresh();
          }, REFRESH_DELAY);
        }
      }
    }

    function scheduleRefresh() {
      if (!active) return;

      if (refreshInFlight) {
        refreshQueued = true;
        return;
      }

      if (timer) return;

      timer = setTimeout(() => {
        void runRefresh();
      }, REFRESH_DELAY);
    }

    // Cada ejecución crea un canal diferente.
    // Evita conflictos durante remontajes de React.
    const channelName =
      `medtime-dose-sync-${userId}-${Date.now()}-${++channelSequence}`;

    const channel = supabase.channel(channelName);

    // IMPORTANTE:
    // Registrar los eventos ANTES de subscribe().
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'dosis_programadas',
      },
      scheduleRefresh,
    );

    // Activar la suscripción después de registrar los eventos.
    channel.subscribe((status) => {
      if (!active) return;

      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn(
          '[MedTime Realtime] Error de suscripción:',
          status,
        );
      }
    });

    // Limpiar correctamente al salir o cambiar de usuario.
    return () => {
      active = false;
      refreshQueued = false;

      if (timer) {
        clearTimeout(timer);
        timer = null;
      }

      void supabase.removeChannel(channel);
    };
  }, [userId]);
}
