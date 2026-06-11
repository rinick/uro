import {useEffect} from 'react';

const AD_SCRIPT_ID = 'ulugo-google-ad-script';

export function GoogleAd() {
  useEffect(() => {
    const adsWindow = window as Window & {adsbygoogle?: unknown[]};
    adsWindow.adsbygoogle = adsWindow.adsbygoogle ?? [];

    if (document.getElementById(AD_SCRIPT_ID) == null) {
      const script = document.createElement('script');
      script.id = AD_SCRIPT_ID;
      script.async = true;
      script.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3283235194066083';
      script.crossOrigin = 'anonymous';
      document.head.appendChild(script);
    }

    adsWindow.adsbygoogle.push({});
  }, []);

  return (
    <ins
      className="adsbygoogle web-ad"
      data-ad-client="ca-pub-3283235194066083"
      data-ad-slot="9855991090"
      data-ad-format="auto"
      data-full-width-responsive="true"
    />
  );
}
