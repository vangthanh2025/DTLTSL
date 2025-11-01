import React from 'react';

interface IconProps {
  className?: string;
}

const LogoIcon: React.FC<IconProps> = ({ className }) => (
    <img 
        src="https://lh3.googleusercontent.com/d/1dZavHQDuiGnjlWj25r44HgdbeRG6rCi2"
        alt="Logo Bệnh Viện Y Học Cổ Truyền"
        className={className}
    />
);

export default LogoIcon;