<?php
declare(strict_types=1);
final class MailTransport {
    public static function send(array $message): void {
        if(getenv('MAIL_DRIVER')==='log') {
            if(getenv('APP_ENV')==='production') throw new RuntimeException('Development mail sink disabled in production');
            $dir=ROOT_PATH.'/writable/mail';if(!is_dir($dir))mkdir($dir,0700,true);
            $file=$dir.'/'.bin2hex(random_bytes(16)).'.json';file_put_contents($file,mce_json($message),LOCK_EX);chmod($file,0600);return;
        }
        if(!Identity::mailConfigured()||getenv('MAIL_DRIVER')!=='smtp') throw new RuntimeException('SMTP not configured');
        $from=getenv('MAIL_FROM');$to=$message['recipient'];
        foreach([$from,$to] as $email) if(!filter_var($email,FILTER_VALIDATE_EMAIL)||preg_match('/[\r\n]/',$email)) throw new RuntimeException('Invalid mail address');
        $host=getenv('SMTP_HOST');$port=(int)(getenv('SMTP_PORT')?:587);$mode=getenv('SMTP_ENCRYPTION')?:'starttls';
        if(!in_array($mode,['starttls','tls'],true)) throw new RuntimeException('Encrypted SMTP is required');
        $context=stream_context_create(['ssl'=>['verify_peer'=>true,'verify_peer_name'=>true,'peer_name'=>$host]]);
        $stream=stream_socket_client(($mode==='tls'?'tls://':'tcp://').$host.':'.$port,$errno,$error,15,STREAM_CLIENT_CONNECT,$context);
        if(!$stream) throw new RuntimeException('SMTP connection failed');stream_set_timeout($stream,15);
        $read=function(array $allowed)use($stream){$line='';do{$part=fgets($stream,2048);if($part===false)throw new RuntimeException('SMTP timeout');$line=$part;}while(isset($part[3])&&$part[3]==='-');if(!in_array((int)substr($line,0,3),$allowed,true))throw new RuntimeException('SMTP rejected request');};
        $cmd=function(string $line,array $codes)use($stream,$read){if(preg_match('/[\r\n]/',$line))throw new RuntimeException('Invalid SMTP command');fwrite($stream,$line."\r\n");$read($codes);};
        try {
            $read([220]);$cmd('EHLO localhost',[250]);
            if($mode==='starttls'){$cmd('STARTTLS',[220]);if(!stream_socket_enable_crypto($stream,true,STREAM_CRYPTO_METHOD_TLS_CLIENT))throw new RuntimeException('SMTP TLS failed');$cmd('EHLO localhost',[250]);}
            if(getenv('SMTP_USER')){$cmd('AUTH LOGIN',[334]);$cmd(base64_encode(getenv('SMTP_USER')),[334]);$cmd(base64_encode(getenv('SMTP_PASSWORD')?:''),[235]);}
            $cmd('MAIL FROM:<'.$from.'>',[250]);$cmd('RCPT TO:<'.$to.'>',[250,251]);$cmd('DATA',[354]);
            $body=str_replace(["\r\n","\r"],"\n",$message['body']);$body=preg_replace('/^\./m','..',$body);$body=str_replace("\n","\r\n",$body);
            $headers='From: '.$from."\r\nTo: ".$to."\r\nSubject: =?UTF-8?B?".base64_encode($message['subject'])."?=\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nDate: ".gmdate('r');
            fwrite($stream,$headers."\r\n\r\n".$body."\r\n.\r\n");
            try {$read([250]);} catch(Throwable $e) { throw new RuntimeException('SMTP delivery uncertain'); }
            // SMTP acceptance is the delivery boundary. A failed QUIT must never resend a message.
            fwrite($stream,"QUIT\r\n");
        } finally { fclose($stream); }
    }
}
