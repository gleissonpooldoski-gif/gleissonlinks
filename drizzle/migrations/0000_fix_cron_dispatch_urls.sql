CREATE OR REPLACE FUNCTION public.dispatch_automation_tick()
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_secret text; v_req bigint;
BEGIN
  SELECT value INTO v_secret FROM public.cron_secrets WHERE name = 'CRON_SECRET' LIMIT 1;
  IF v_secret IS NULL OR length(v_secret) = 0 THEN RETURN NULL; END IF;
  SELECT net.http_post(
    url := 'https://project--c8d0a9f8-2712-4d4d-b2f8-6b9530849b41.lovable.app/api/public/hooks/automation-tick',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',v_secret,'apikey','sb_publishable_Q2XHZhrMoeU0ayxOWS5mfg_ohSKZyli'),
    body := '{}'::jsonb
  ) INTO v_req;
  RETURN v_req;
END; $$;

CREATE OR REPLACE FUNCTION public.dispatch_system_reaper()
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_secret text; v_req bigint;
BEGIN
  SELECT value INTO v_secret FROM public.cron_secrets WHERE name = 'CRON_SECRET' LIMIT 1;
  IF v_secret IS NULL OR length(v_secret) = 0 THEN RETURN NULL; END IF;
  SELECT net.http_post(
    url := 'https://project--c8d0a9f8-2712-4d4d-b2f8-6b9530849b41.lovable.app/api/public/hooks/system-reaper',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',v_secret,'apikey','sb_publishable_Q2XHZhrMoeU0ayxOWS5mfg_ohSKZyli'),
    body := '{}'::jsonb
  ) INTO v_req;
  RETURN v_req;
END; $$;

CREATE OR REPLACE FUNCTION public.dispatch_tunnel_health()
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_secret text; v_req bigint;
BEGIN
  SELECT value INTO v_secret FROM public.cron_secrets WHERE name = 'CRON_SECRET' LIMIT 1;
  IF v_secret IS NULL OR length(v_secret) = 0 THEN RETURN NULL; END IF;
  SELECT net.http_post(
    url := 'https://project--c8d0a9f8-2712-4d4d-b2f8-6b9530849b41.lovable.app/api/public/hooks/tunnel-health',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',v_secret,'apikey','sb_publishable_Q2XHZhrMoeU0ayxOWS5mfg_ohSKZyli'),
    body := '{}'::jsonb
  ) INTO v_req;
  RETURN v_req;
END; $$;

SELECT cron.alter_job(13, command := $cmd$SELECT net.http_post(
      url := 'https://project--c8d0a9f8-2712-4d4d-b2f8-6b9530849b41.lovable.app/api/public/hooks/instagram-tick',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (SELECT value FROM public.cron_secrets WHERE name = 'CRON_SECRET' LIMIT 1),
        'apikey', 'sb_publishable_Q2XHZhrMoeU0ayxOWS5mfg_ohSKZyli'
      ),
      body := '{}'::jsonb
    );$cmd$);