#!/bin/bash
# Fetch candidate chunky display fonts (TTF) from the google/fonts repo via jsDelivr.
cd "$(dirname "$0")/ttf"
B=https://cdn.jsdelivr.net/gh/google/fonts@main
for p in \
  ofl/bungee/Bungee-Regular.ttf ofl/bungeeinline/BungeeInline-Regular.ttf ofl/bungeeshade/BungeeShade-Regular.ttf \
  ofl/titanone/TitanOne-Regular.ttf ofl/lilitaone/LilitaOne-Regular.ttf apache/luckiestguy/LuckiestGuy-Regular.ttf \
  ofl/bowlbyonesc/BowlbyOneSC-Regular.ttf ofl/bowlbyone/BowlbyOne-Regular.ttf ofl/chango/Chango-Regular.ttf \
  ofl/rammettoone/RammettoOne-Regular.ttf ofl/sigmarone/SigmarOne-Regular.ttf ofl/sigmar/Sigmar-Regular.ttf \
  ofl/passionone/PassionOne-Bold.ttf ofl/passionone/PassionOne-Black.ttf ofl/rubikmonoone/RubikMonoOne-Regular.ttf \
  ofl/lemon/Lemon-Regular.ttf ofl/ericaone/EricaOne-Regular.ttf ofl/spicyrice/SpicyRice-Regular.ttf \
  ofl/bangers/Bangers-Regular.ttf ofl/russoone/RussoOne-Regular.ttf ofl/blackopsone/BlackOpsOne-Regular.ttf \
  apache/ultra/Ultra-Regular.ttf ofl/changaone/ChangaOne-Regular.ttf ofl/knewave/Knewave-Regular.ttf \
  ofl/paytoneone/PaytoneOne-Regular.ttf ofl/carterone/CarterOne-Regular.ttf ofl/holtwoodonesc/HoltwoodOneSC-Regular.ttf \
  ofl/alfaslabone/AlfaSlabOne-Regular.ttf ofl/cinzel/Cinzel%5Bwght%5D.ttf ofl/tiltwarp/TiltWarp%5BXROT%2CYROT%5D.ttf \
  ofl/fredoka/Fredoka%5Bwdth%2Cwght%5D.ttf ofl/baloo2/Baloo2%5Bwght%5D.ttf ofl/gluten/Gluten%5Bslnt%2Cwght%5D.ttf \
  ofl/bevan/Bevan-Regular.ttf ofl/rubik/Rubik%5Bwght%5D.ttf ofl/nunito/Nunito%5Bwght%5D.ttf ofl/alegreyasans/AlegreyaSans-Black.ttf \
  ofl/alegreyasans/AlegreyaSans-ExtraBold.ttf ofl/bungeespice/BungeeSpice-Regular.ttf ofl/joti one/JotiOne-Regular.ttf ofl/jotione/JotiOne-Regular.ttf \
  ofl/titanone/OFL.txt ; do
  f=$(basename "$p" | sed 's/%5B.*//; s/%2C.*//')
  [[ "$f" == *.ttf ]] || f="$(basename "$(dirname "$p")")-$f"
  [[ "$f" == *[^.]*.ttf || "$f" == *.txt ]] || f="$f.ttf"
  code=$(curl -sSL -o "$f" -w "%{http_code}" "$B/$p")
  if [ "$code" != 200 ]; then rm -f "$f"; echo "MISS $p"; else echo "ok   $f"; fi
done
