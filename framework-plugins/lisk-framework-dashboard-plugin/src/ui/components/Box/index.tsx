/*
 * Copyright © 2021 Lisk Foundation
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Unless otherwise agreed in a custom licensing agreement with the Lisk Foundation,
 * no part of this software, including this file, may be copied, modified,
 * propagated, or distributed except according to the terms contained in the
 * LICENSE file.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import * as React from 'react';
import styles from './Box.module.scss';

interface BoxProp {
	mt?: number;
	mb?: number;
	ml?: number;
	mr?: number;
	pt?: number;
	pb?: number;
	pl?: number;
	pr?: number;
}

const Box: React.FC<BoxProp> = props => {
	const { mt, mb, ml, mr, pt, pb, pl, pr } = props;

	if ([mt, mb, ml, mr, pt, pb, pl, pr].filter(Boolean).some(i => (i as number) < 1)) {
		throw new Error('Box margin, padding values can not be less than 1');
	}

	if ([mt, mb, ml, mr, pt, pb, pl, pr].filter(Boolean).some(i => (i as number) > 5)) {
		throw new Error('Box margin, padding values can not be greater than 5');
	}

	const classes = [
		mt ? styles[`m-t-${mt}`] : '',
		mb ? styles[`m-b-${mb}`] : '',
		ml ? styles[`m-l-${ml}`] : '',
		mr ? styles[`m-r-${mr}`] : '',
		pt ? styles[`p-t-${pt}`] : '',
		pb ? styles[`p-b-${pb}`] : '',
		pl ? styles[`p-l-${pl}`] : '',
		pr ? styles[`p-r-${pr}`] : '',
	].filter(Boolean);

	return <div className={classes.join(' ')}>{props.children}</div>;
};

export default Box;