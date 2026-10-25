<?php
// Minimal stand-ins for the Laravel classes the installer uses, so its copy logic runs against a real filesystem.
namespace Illuminate\Console { class Command {
    const SUCCESS = 0; const FAILURE = 1; public array $opts = []; public array $out = [];
    public function option($k){ return $this->opts[$k] ?? false; }
    public function info($m){ $this->out[]=$m; } public function line($m){ $this->out[]=$m; }
    public function error($m){ $this->out[]="ERROR $m"; } public function comment($m){ $this->out[]=$m; }
    public function newLine(){ } } }
namespace Illuminate\Filesystem { class Filesystem {
    public function isDirectory($p){ return is_dir($p); } public function isFile($p){ return is_file($p); }
    public function exists($p){ return file_exists($p); } public function copy($a,$b){ return copy($a,$b); }
    public function ensureDirectoryExists($d){ if(!is_dir($d)) mkdir($d,0777,true); }
    public function allFiles($dir,$hidden=false){ $r=[]; $it=new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($dir,\FilesystemIterator::SKIP_DOTS));
        foreach($it as $f){ if($f->isFile()){ $o=new class($f->getPathname(),substr($f->getPathname(),strlen(rtrim($dir,'/'))+1)) extends \SplFileInfo{ public function __construct($p,public string $rel){parent::__construct($p);} public function getRelativePathname(){return $this->rel;} }; $r[]=$o; } } return $r; } } }
namespace {
    $proj = $argv[2]; mkdir($proj,0777,true);
    function base_path($p=''){ global $proj; return $proj.($p?'/'.$p:''); }
    require $argv[1].'/src/Commands/InstallAITeam.php';
    $c = new Emerson\AITeamSetup\Commands\InstallAITeam();
    $rc = $c->handle(new Illuminate\Filesystem\Filesystem());
    echo end($c->out) === null ? '' : '', "exit=$rc\n";
    foreach ($c->out as $l) if (str_contains($l,'ERROR') || str_contains($l,'installed') || str_contains($l,'missing')) echo $l,"\n";
}
